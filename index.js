/**
 * Google News Domain Checker
 *
 * This script checks if domains are valid Google News sources using multiple search strategies.
 * It uses Puppeteer to automate browser interactions with Google News.
 */

const puppeteer = require("puppeteer");
const chalk = require("chalk");
const cliProgress = require("cli-progress");
const fs = require("fs");
const path = require("path");
const { url } = require("inspector");

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  input: null,
  output: "results.json",
  headless: true,
  verbose: false,
  region: "en-US",
};

// Parse command line flags
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--input":
    case "-i":
      options.input = args[++i];
      break;
    case "--output":
    case "-o":
      options.output = args[++i];
      break;
    case "--no-headless":
      options.headless = false;
      break;
    case "--verbose":
    case "-v":
      options.verbose = true;
      break;
    case "--region":
    case "-r":
      options.region = args[++i];
      break;
    case "--help":
    case "-h":
      console.log(`
${chalk.bold("Google News Domain Checker")}

Usage: node index.js [options]

Options:
  -i, --input FILE      Input file with domains (one per line)
  -o, --output FILE     Output file to save results (default: results.json)
      --no-headless     Run Chrome in visible mode
  -v, --verbose         Show detailed search progress
  -r, --region REGION   Region code to use (default: en-US)
  -h, --help            Show this help
`);
      process.exit(0);
  }
}

// Load domains from file or use default list
function loadDomains() {
  if (options.input) {
    try {
      const content = fs.readFileSync(options.input, "utf8");
      return content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));
    } catch (error) {
      console.error(
        chalk.red(
          `Error loading domains from ${options.input}: ${error.message}`
        )
      );
      process.exit(1);
    }
  } else {
    // Default list of domains to check
    return [
      "isolanews.net",
      "istudentpro.com",
      "iandrew.org",
      "newminnesotastadium.com",
      "aivea.com",
      "citizen.xyz",
      "Kazan.com",
      "BrightPixel.com",
      "RbfHealth.org",
      "Nevale.com",
      "BusinessAssurance.com",
      "StrongBet.com",
      "AacoFarmersMarket.com",
      "Pfks.com",
      "lu10radioazul.com",
      "FlaskBb.org",
      "EcomInt.com",
      "mydroll.com",
      "DaenOtes.com",
      "HolEinTheWallCamps.org",
      "GroopIt.com",
      "Exalab.com",
      "PurAvive.com",
      "Furri.com",
      "GmacInsurance.com",
      "Ubms.com",
      "elcabildo.org",
      "OmniVector.com",
      "Tayai.com",
      "spiritualite-chretienne.com",
      "SaPata.com",
      "Inftech.com",
      "HealthClass.com",
      "Pvzk.com",
      "SovietSuPrem.com",
      "MoodPanda.com",
      "RetroTopia.com",
      "Pokies.net",
      "GardenPride.com",
      "Mabbo.com",
      "RigOra.com",
      "Origines.com",
      "VarChi.com",
      "LuxuryMag.com",
      "guideauto.com",
      "MuseoCatAcumbas.com",
      "SoarTex.net",
      "InmoNova.com",
      "NutRidenSe.com",
      "MagnetAgency.com",
      "TradesIndia.com",
      "NordicBrand.com",
    ];
  }
}

// Get the domains to check
const domains = loadDomains();

// Google News regions to check
const availableRegions = {
  "en-US": { code: "en-US", gl: "US", ceid: "US:en" }, // US English
  "es-ES": { code: "es-ES", gl: "ES", ceid: "ES:es" }, // Spanish
  "fr-FR": { code: "fr-FR", gl: "FR", ceid: "FR:fr" }, // French
  "it-IT": { code: "it-IT", gl: "IT", ceid: "IT:it" }, // Italian
  "de-DE": { code: "de-DE", gl: "DE", ceid: "DE:de" }, // German
  "pt-BR": { code: "pt-BR", gl: "BR", ceid: "BR:pt-419" }, // Portuguese (Brazil)
};

// Get regions to check based on options
function getRegionsToCheck() {
  const selectedRegion = options.region;

  if (selectedRegion === "all") {
    return Object.values(availableRegions);
  } else if (availableRegions[selectedRegion]) {
    return [availableRegions[selectedRegion]];
  } else {
    console.warn(
      chalk.yellow(`Warning: Unknown region "${selectedRegion}", using en-US`)
    );
    return [availableRegions["en-US"]];
  }
}

const regions = getRegionsToCheck();

// Search strategies to use
const searchStrategies = [
  // {
  //   name: "Domain with extension",
  //   generateQuery: (domain) => domain,
  // },
  // {
  //   name: "Domain without extension",
  //   generateQuery: (domain) => domain.split(".")[0],
  // },
  {
    name: "Site query",
    generateQuery: (domain) => `site:${domain}`,
  },
  //   {
  //     name: "InURL query",
  //     generateQuery: (domain) => `inurl:${domain}*`,
  //   },
];

/**
 * Encodes a query string for use in a URL
 */
function encodeQuery(query) {
  return encodeURIComponent(query);
}

/**
 * Generate the Google News URL for the given region and query
 */
function generateGoogleNewsUrl(region, query) {
  return `https://news.google.com/search?q=${encodeQuery(query)}&hl=${
    region.code
  }&gl=${region.gl}&ceid=${region.ceid}`;
}

/**
 * Generate the Google News publication URL for a domain
 */
function generatePublicationUrl(domain, region) {
  // Just a skeleton - in reality, we'd need to extract the publication ID
  return `https://news.google.com/publications/${domain}?hl=${region.code}&gl=${region.gl}&ceid=${region.ceid}`;
}

/**
 * Check if a domain is a valid Google News source using different search strategies
 */
async function checkDomain(domain, browser, progressBar) {
  const results = {
    domain,
    isValidSource: false,
    validationUrl: null,
    searchResults: [],
  };

  // Try each region
  for (const region of regions) {
    if (results.isValidSource) break; // Stop if we've already found a match

    // Try each search strategy
    for (const strategy of searchStrategies) {
      if (results.isValidSource) break; // Stop if we've already found a match

      const query = strategy.generateQuery(domain);
      const url = generateGoogleNewsUrl(region, query);
      console.log(chalk.blue(`[SEARCH URL] ${url}`));

      try {
        const page = await browser.newPage();

        // Set user agent to avoid detection
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );

        if (options.verbose) {
          console.log(
            chalk.gray(
              `  Strategy: ${strategy.name}, Region: ${region.code}, URL: ${url}`
            )
          );
        }

        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

        // Look for indicators that this is a valid news source
        const indicators = [
          // Check if there are any search results
          async () => {
            const noResultsElement = await page.$(
              "#yDmH0d > c-wiz > div > main > div.UW0SDc"
            );

            if (noResultsElement) {
              const text = await page.evaluate(
                (el) => el.textContent,
                noResultsElement
              );

              console.log(chalk.red(`[TEXT CONTENT] ${text}`));

              if (text.trim().startsWith("There are no items to show.")) {
                console.log(
                  chalk.red(`[NO RESULTS] Found "There are no items to show."`)
                );
                return false;
              } else {
                console.log(
                  chalk.green(`[RESULTS FOUND] Text content: "${text}"`)
                );
                const noResultsElement = await page.$(
                  "div.UW0SDc article div.m5k28 div.B6pJDd div.oovtQ > div > div"
                );

                if (noResultsElement) {
                  const text1 = await page.evaluate(
                    (el) => el.textContent,
                    noResultsElement
                  );
                  if (text1.toLowerCase() === domain.toLowerCase()) {
                    return true;
                  } else {
                    return false;
                  }
                }
              }
            } else {
              console.log(
                chalk.yellow(`[ELEMENT NOT FOUND] No .UW0SDc element found`)
              );
              // Default to assuming results exist if we can't find the message
              return true;
            }
          },

          // Check if there's a "Go to [domain]" option in any article menu
          // async () => {
          //   // Click on the first article's menu button if it exists
          //   const menuButtons = await page.$$(
          //     "div[jscontroller] > div > div > div > c-wiz > div > div > div > div > div > div > div:nth-child(2) > div > menu > div"
          //   );

          //   if (menuButtons.length > 0) {
          //     await menuButtons[0].click();
          //     await page.waitForTimeout(1000); // Wait for menu to appear

          //     // Look for the "Go to [domain]" option
          //     const menuItems = await page.$$('div[role="menuitem"]');
          //     for (const menuItem of menuItems) {
          //       const text = await page.evaluate(
          //         (el) => el.textContent,
          //         menuItem
          //       );
          //       if (
          //         text.toLowerCase().includes("go to") &&
          //         text
          //           .toLowerCase()
          //           .includes(domain.split(".")[0].toLowerCase())
          //       ) {
          //         await menuItem.click();
          //         await page.waitForTimeout(2000); // Wait for navigation

          //         // Check if we're now on a publications page
          //         const url = page.url();
          //         if (url.includes("/publications/")) {
          //           results.isValidSource = true;
          //           results.validationUrl = url;
          //           break;
          //         }
          //       }
          //     }

          //     // Close the menu if it's still open
          //     await page.keyboard.press("Escape");
          //   }

          //   return false;
          // },

          // // Check if we can find a direct publications link
          // async () => {
          //   // Check if current URL indicates a publication
          //   const url = page.url();
          //   if (url.includes("/publications/")) {
          //     results.isValidSource = true;
          //     results.validationUrl = url;
          //     return true;
          //   }
          //   return false;
          // },
        ];

        // Run each indicator check
        for (const indicator of indicators) {
          if (await indicator()) {
            results.isValidSource = true;
            break;
          }
        }

        // Record this search attempt
        results.searchResults.push({
          strategy: strategy.name,
          region: region.code,
          query,
          url,
          success: results.isValidSource,
        });

        await page.close();
      } catch (error) {
        console.error(
          `Error checking ${domain} with strategy ${strategy.name} in region ${region.code}:`,
          error.message
        );
      }
    }
  }

  // Update progress
  progressBar.increment();

  return results;
}

/**
 * Main function to run the checker
 */
async function run() {
  console.log(chalk.blue.bold("Google News Domain Checker"));
  console.log(
    chalk.gray(`Checking ${domains.length} domains against Google News...`)
  );

  // Set up progress bar
  const progressBar = new cliProgress.SingleBar({
    format:
      "Progress |" +
      chalk.cyan("{bar}") +
      "| {percentage}% || {value}/{total} domains",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  progressBar.start(domains.length, 0);

  // Launch browser
  const browser = await puppeteer.launch({
    headless: options.headless ? "new" : false, // Use new headless if enabled
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = [];

  // Check each domain
  for (const domain of domains) {
    const result = await checkDomain(domain, browser, progressBar);
    results.push(result);

    // Log result immediately
    const statusColor = result.isValidSource ? chalk.green : chalk.red;
    const status = result.isValidSource ? "VALID SOURCE" : "NOT A SOURCE";
    console.log(
      `${statusColor(status)} | ${domain}${
        result.validationUrl ? ` | ${result.validationUrl}` : ""
      }`
    );
  }

  // Close browser and progress bar
  await browser.close();
  progressBar.stop();

  // Output final results
  console.log("\n" + chalk.yellow.bold("Results Summary:"));
  const validCount = results.filter((r) => r.isValidSource).length;
  console.log(
    chalk.green(
      `Valid Sources: ${validCount}/${domains.length} (${Math.round(
        (validCount / domains.length) * 100
      )}%)`
    )
  );

  console.log("\n" + chalk.green.bold("Valid Google News Sources:"));
  results
    .filter((r) => r.isValidSource)
    .forEach((r) => {
      console.log(`${r.domain} | ${r.validationUrl}`);
    });

  console.log("\n" + chalk.red.bold("Not Google News Sources:"));
  results
    .filter((r) => !r.isValidSource)
    .forEach((r) => {
      console.log(r.domain);
    });

  // Save results to file
  try {
    fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
    console.log(chalk.blue(`\nResults saved to ${options.output}`));

    // Also save as CSV if requested
    if (options.output.toLowerCase().endsWith(".csv")) {
      const csvContent = ["Domain,IsValidSource,ValidationUrl"];

      results.forEach((r) => {
        csvContent.push(
          `${r.domain},${r.isValidSource},${r.validationUrl || ""}`
        );
      });

      fs.writeFileSync(options.output, csvContent.join("\n"));
    }
  } catch (error) {
    console.error(
      chalk.red(`Error saving results to ${options.output}: ${error.message}`)
    );
  }
}

// Run the script
run().catch(console.error);
