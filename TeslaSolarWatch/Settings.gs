/**
 * These are the settings for the Tesla Solar Watch project.
 * For first time setup: go to https://github.com/TorZidan/TeslaWatch/blob/main/TeslaSolarWatch/README.md
 * and follow the instructions.
 * 
 * They are used by the code in file TeslaSolarWatch.gs (which is also part of this project).
 */

// The URL of the spreadsheet that keeps the historical data, e.g.
// https://docs.google.com/spreadsheets/d/..giberrish.../edit
// Note: you may choose to ommit everything after "/edit", it's optional.
var TESLA_SOLAR_WATCH_SPREADSHEET_URL = "";

// The tesla refresh_token (a very long giberrish) lasts for months once you login into your Tesla account.
// We use it each time to get an access_token from the Tesla auth service, which is then used in each Tesla API call.
var REFRESH_TOKEN= "";

// Most often you'll want to enter your email address here; If entering multiple email recepients,
// separate them with quota (,). If you're not getting these emails, check your spam folder :)
EMAIL_RECEPIENTS = "";

// If any of the tesla solar installations (also known as site id-s) in your Tesla Account
// generated less than the amount below in the last 1 day,
// then send an "alert" email (to the email recepients above)
DAILY_SOLAR_GENERATION_ALERT_THRESHOLD_WATTS = 100;

