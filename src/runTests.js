require('dotenv').config();

const { extractFields } = require('./extractor');
const fs   = require('fs');
const path = require('path');

const SAMPLES = [
  {
    label: "1 - Clean receipt",
    text:  "Paid ₹ 1,250 to AWS India Pvt Ltd on 12 March 2024. " +
           "Invoice #INV-2024-0312. Services: cloud compute."
  },
  {
    label: "2 - Vendor email",
    text:  "Hi team, please find attached the invoice from Zoho Corp " +
           "for ₹ 4,800 (software subscription, April 2024). " +
           "Reference: ZHO-88821."
  },
  {
    label: "3 - Slack message",
    text:  "hey can someone reimburse me for the uber last tuesday? " +
           "it was like 340 rupees, went to the airport for the client meeting"
  },
  {
    label: "4 - Scanned receipt",
    text:  "DELHI METRO RAIL CORP Token: 0042 Fare: INR 30 " +
           "Date: 29-04-2024 From: Rajiv Chowk To: Hauz Khas"
  },
  {
    label: "5 - Ambiguous/garbage",
    text:  "meeting notes: discussed q2 targets, revenue up 12%, " +
           "john to follow up with vendors next week"
  }
];

async function runAll() {
  const results = [];

  for (const sample of SAMPLES) {
    console.log(`\nProcessing: ${sample.label}...`);
    try {
      const result = await extractFields(sample.text);
      results.push({ label: sample.label, input: sample.text, ...result });
      console.log(`  review_required: ${result.review_required}`);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ label: sample.label, input: sample.text, error: err.message });
    }
  }

  const outPath = path.join(__dirname, '..', 'results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nresults.json written to ${outPath}`);
}

runAll().catch(console.error);
