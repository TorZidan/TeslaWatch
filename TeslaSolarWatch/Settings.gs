/**
 * Tesla Solar Watch version 1.0.
 * 
 * This code is subject to the software license at https://github.com/TorZidan/TeslaWatch/blob/main/LICENSE
 *
 * These are the settings for the Tesla Solar Watch project.
 * They are used by the code in file TeslaSolarWatch.gs (which is also part of this project).
 * 
 * For first time setup, go to https://github.com/TorZidan/TeslaWatch/blob/main/TeslaSolarWatch/README.md
 * and follow the instructions.
 */

// The URL of the spreadsheet that keeps the historical data, e.g.
// https://docs.google.com/spreadsheets/d/..gibberrish.../edit
// Note: you may choose to omit everything after "/edit", it's optional.
TESLA_SOLAR_WATCH_SPREADSHEET_URL = "";

// The tesla refresh_token (a very long gibberrish) lasts for months, once you get it by loging into your Tesla account.
// The code uses it each time to get an access_token from the Tesla auth service, which is then used in each Tesla API restful call.
REFRESH_TOKEN= "";

// Most often you'll want to enter your email address here; If entering multiple email recepients,
// separate them with quota (,). If you're not getting these emails, check your spam folder :)
EMAIL_RECIPIENTS = "";

// If any of the tesla solar installations (also known as site id-s) in your Tesla Account
// generated less than the amount below in the last 1 day,
// then send an "alert" email (to the email recepients above)
DAILY_SOLAR_GENERATION_ALERT_THRESHOLD_WATTS = 100;

// In additon to the alert emails, you may choose to get daily or weekly or monthly summary emails, or none:
// - the daily   emails are sent every day, at the time when the script is scheduled to run;
// - the weekly  emails are sent every Sunday, at the time when the script is scheduled to run;
// - the monthly emails are sent every 1st of the month, at the time when the script is scheduled to run. 
// Valid values: "None", "Daily", "Weekly", "Monthly"
SUMMARY_EMAIL_TYPE="Weekly";

