/**
 * This is the Apps Script code for the Tesla Solar Watch project.
 * See https://github.com/TorZidan/TeslaWatch/blob/main/TeslaSolarWatch/README.md for more info.
 */

// All these fields will be automatically added as a "header row" on row 1 of the spreadsheet:
const SCRIPT_RUN_TIMESTAMP_FIELD_NAME = "apps_script_run_timestamp";
// These fields are part of the Tesla data API:
const ENERGY_SITE_FIELD_NAMES = [
  "timestamp",
  "solar_energy_exported",
  "grid_energy_imported",
  "grid_energy_exported_from_solar",
  "grid_energy_exported_from_battery",
  "battery_energy_exported",
  "battery_energy_imported_from_grid",
  "battery_energy_imported_from_solar",
  "consumer_energy_imported_from_grid",
  "consumer_energy_imported_from_solar",
  "consumer_energy_imported_from_battery"
];

/**
 * The main function in this app.
 * 
 * It should be scheduled to run daily, e.g. around 1AM, in the "Triggers" section
 * of your AppsScript project.
 * 
 * Uses a spreadsheet to store the data retrieved at each call, for convenience and history preservation.
 * 
 * Makes the necessary calls to the Tesla API server over https to retrieve data.
 * For each solar installation in this tesla account:
 *   - retrieves solar usage data for the previous day.
 *   - sends email if the generated solar power was below the predefined threshold.
 *   - inserts a row in the spreadsheet tab that coresponds to this solar installation.
 */
function main() {
  // Make sure all settings have been properly set:
  if(TESLA_SOLAR_WATCH_SPREADSHEET_URL==null || TESLA_SOLAR_WATCH_SPREADSHEET_URL==="") {
    throw ("The variable TESLA_SOLAR_WATCH_SPREADSHEET_URL is empty. Please enter your spreadsheet url in it. Most often the varaiable is in file Settings.gs");
  }
  if(EMAIL_RECEPIENTS==null || EMAIL_RECEPIENTS==="") {
    throw ("The variable EMAIL_RECEPIENTS is empty. Please enter the email recepient(s) it. Most often the varaiable is in file Settings.gs");
  }
  if(REFRESH_TOKEN==null || REFRESH_TOKEN==="") {
    throw ("The variable REFRESH_TOKEN is empty. Please follow the instructions at ... to get a new refresh token and then copy/paste it in this variable. Most often the varaiable is in file Settings.gs");
  }
  
  // The spreadsheet object
  var sheet = SpreadsheetApp.openByUrl(TESLA_SOLAR_WATCH_SPREADSHEET_URL);

  // We need an access token (a long giberrish string) to communicate with the Tesla API server.
  // The access token usually expires in 8 hours; 
  // Since we are running this code every 24 hours, we need to refresh it first:
  var accessToken = getNewAccessToken(REFRESH_TOKEN, EMAIL_RECEPIENTS);

  // Retrieve the energy products in my Tesla account (aka energy site id-s):
  const arrayOfEnergySiteIds = listEnergySiteIdsForAccount(accessToken);

  // For each energy product (aka energy site id), retrieve the energy stats for the last 1 day,
  // find the corresponsding spreadsheet tab for this product, and append a row in that tab:
  for(i=0; i < arrayOfEnergySiteIds.length; i++) {
    const energySiteId = arrayOfEnergySiteIds[i];
    
    // e.g. "America/Los_Angeles":
    const energySiteTimeZone = getEnergySiteTimeZone(energySiteId, accessToken);

    // Example: 2023-12-22T11:13:06-0800
    const currentTimestampInUtcFormatted = Utilities.formatDate(new Date(), energySiteTimeZone, 'yyyy-MM-dd\'T\'HH:mm:ssZ');
    
    // This is a data structure with many attributes, e.g. "solar_energy_exported":
    const data = getEnergyDataForLastDay(energySiteId, energySiteTimeZone, accessToken);

    // Find the (first) tab in the spreadsheet that contains the string "<energy_site_id> - Daily Script Run", 
    // e.g. "2252181956594930 - Daily Script Run". 
    // This way the user may choose to rename the tab to e.g. "My Solar System - 2252181956594930 - Daily Script Run", 
    // and the code will still locate it:
    const sheetTabForProductId = findOrCreateSheetTabWithNameLike(sheet, energySiteId+" - Daily Script Run");
    
    // Insert a header row with column names, if not already present:
    insertHeaderRowWithColumnNamesIfNeeded(sheetTabForProductId);

    const spreadsheetUrlForEmail = composeSpreadsheetTabUrl(TESLA_SOLAR_WATCH_SPREADSHEET_URL, sheetTabForProductId.getSheetId(), sheetTabForProductId.getLastRow()+1);

    const enegryGeneratedDuringLastDayWatts = data[ENERGY_SITE_FIELD_NAMES[1]];
    if(enegryGeneratedDuringLastDayWatts <= DAILY_SOLAR_GENERATION_ALERT_THRESHOLD_WATTS) {
      Logger.log("Alert: in the last day energySiteId "+energySiteId+" generated "+enegryGeneratedDuringLastDayWatts+" watts, which is below the alerting threshold of "+DAILY_SOLAR_GENERATION_ALERT_THRESHOLD_WATTS+" watts. Sending an alert email to "+EMAIL_RECEPIENTS);
      const lastDayEnergyGeneratedWatts = data[ENERGY_SITE_FIELD_NAMES[1]];
      sendAlertEmail(lastDayEnergyGeneratedWatts, DAILY_SOLAR_GENERATION_ALERT_THRESHOLD_WATTS, EMAIL_RECEPIENTS, spreadsheetUrlForEmail);
    } else {
      Logger.log("All is good: in the last day energySiteId "+energySiteId+" generated "+enegryGeneratedDuringLastDayWatts+" watts, which is above the alerting threshold of "+DAILY_SOLAR_GENERATION_ALERT_THRESHOLD_WATTS+" watts.");
    }

    var newRowDataAsArray = [];
    // The 1st column contains the (start) time of this run:
    newRowDataAsArray.push(currentTimestampInUtcFormatted);
    // The rest of the columns in the row are populated from the Tesla data:
    for(j=0; j < ENERGY_SITE_FIELD_NAMES.length; j++) {
      const fieldName = ENERGY_SITE_FIELD_NAMES[j];
      newRowDataAsArray.push(data[fieldName]);
    }
    // Append the row at the end:
    sheetTabForProductId.appendRow(newRowDataAsArray);
  }
}

/**
 * As it says
 */
function insertHeaderRowWithColumnNamesIfNeeded(sheetTab) {
  const cellA0Value = sheetTab.getRange(1, 1, 1, 1).getValue();
  if(cellA0Value != SCRIPT_RUN_TIMESTAMP_FIELD_NAME) {
    // Insert 1 new row(s) at position 1:
    sheetTab.insertRows(1, 1);
    // getRange(row, column, numRows, numColumns):
    sheetTab.getRange(1,1,1,1).setValue(SCRIPT_RUN_TIMESTAMP_FIELD_NAME);
    sheetTab.getRange(1,2,1,ENERGY_SITE_FIELD_NAMES.length).setValues([ENERGY_SITE_FIELD_NAMES]);
    // Freeze the header row, so that when we scroll down the hundreds of data rows, we always see it:
    sheetTab.setFrozenRows(1);
  }
}

/**
 * Finds the (first) tab in this spreadsheet whose name contains the string in tabNameSubstring, and returns it.
 * If not found, then creates a new tab with name tabNameSubstring and returns it.
 */
function findOrCreateSheetTabWithNameLike(spreadsheet, tabNameSubstring) {
  var sheetTabsArray = spreadsheet.getSheets();
  for(i=0; i < sheetTabsArray.length; i++) {
    if(sheetTabsArray[i].getName().includes(tabNameSubstring)) {
      return sheetTabsArray[i];
    }
  }
  var newSheetTab = sheet.insertSheet();
  newSheetTab.setName(tabNameSubstring);
  return newSheetTab;
}

/**
 * Calls the Tesla API at "https://owner-api.teslamotors.com/api/1/products",
 * retrieves all products owned by this account (vehicles, mars rockets, solar/energy installations, flame throwers),
 * then filters only the solar/energy installations, and returns an array of their "siteId-s".
 * 
 * Sample response text:
    {
      "response": [
        {
          "id": 1492931576552070,
          "vehicle_id": 1557873031,
        },
        {
          "energy_site_id": 2252181956594930,
          "resource_type": "solar",
          "id": "STE20221227-00187",
          "asset_site_id": "a6e5970f-e4f0-4e7e-872c-cd1509cfb616",
          "grid_installation_id": "1147969e-5038-44d8-a06e-48c5aa18a7b3",
        }
      ],
      "count": 2
    }
 */
function listEnergySiteIdsForAccount(accessToken) {
  try {
    const url = "https://owner-api.teslamotors.com/api/1/products";
    
    var options = {
      'headers': {
        'authorization': 'Bearer ' + accessToken
      }
    };

    const responseText = UrlFetchApp.fetch(url, options);
    const allData = JSON.parse(responseText);
    //Logger.log(allData);

    if(allData["response"] == null || allData["response"].length ==0) {
      throw ("Things did not go well. There is no 'response' entry in the response text, or it contains no 'products': "+responseText);
    }
    const innerData = allData["response"];
    Logger.log(innerData);

    var energySiteIds = [];
    for(i=0; i< innerData.length; i++) {
      const product = innerData[i];

      if(product["energy_site_id"] != null) {
        energySiteIds.push(product["energy_site_id"]);
      }
    }

    Logger.log("Found the followingfenergy siteId-s in my Tesla account: "+energySiteIds);
    return energySiteIds;
  } catch (e) {
    Logger.log("The Tesla API call "+url+" failed. See the error below for more info.");
    throw e;
  }
}

/**
 * Calls the Tesla API at "https://owner-api.teslamotors.com/api/1/energy_sites/{siteId}/site_info"
 * and retrieves the time zone (e.g. 'America/Los_Angeles') of this energy siteId.
 */
function getEnergySiteTimeZone(siteId, accessToken) {
  try {
    const url = "https://owner-api.teslamotors.com/api/1/energy_sites/"+siteId+"/site_info";
    Logger.log("Getting site info from "+url);

    var options = {
      'headers': {
        'authorization': 'Bearer ' + accessToken
      }
    };

    const responseText = UrlFetchApp.fetch(url, options);
    const allData = JSON.parse(responseText);
    //Logger.log(allData);

    const responseData = allData["response"];
    if(responseData == null) {
      throw ("Unexpected response from url '"+url+"' : there is no 'response' entry in the response text: "+responseText);
    }

    const result = responseData["installation_time_zone"];
    // Another way of doing this: const result = allData.response.installation_time_zone;
    //Logger.log(result);
    if(result == null || result==="") {
      throw ("Unexpected response from url '"+url+"' : there is no 'installation_time_zone' entry in the response text: "+responseText);
    }

    Logger.log("Got installation_time_zone='" + result + "'");
    return result;
  } catch (e) {
    Logger.log("The Tesla API call "+url+" failed. See the error below for more info.");
    throw e;
  }
}


/**
 * Calls the Tesla API at "https://owner-api.teslamotors.com/api/1/energy_sites/{siteId}/calendar_history?......"
 * and retrieves the energy stats (one row per day) in the last one month.
 * Then takes the last record and returns it.
 * 
 * Note: It actually returns data from the previous month's last day up until yesterday;
 * this way, even if we make the call on the 1st ofd the month, we will still get yeasterday's data.
 */
function getEnergyDataForLastDay(siteId, inTimeZone, accessToken) {
  try {
    const currentTimestampInTimeZoneFormatted = Utilities.formatDate(new Date(), inTimeZone, 'yyyy-MM-dd\'T\'HH:mm:ss\'-00:00\'');
    const url = "https://owner-api.teslamotors.com/api/1/energy_sites/"+siteId+"/calendar_history?kind=energy&period=month&time_zone="+inTimeZone+"&end_date="+currentTimestampInTimeZoneFormatted;
    Logger.log("Getting energy stats from "+url);

    var options = {
      'headers': {
        'authorization': 'Bearer ' + accessToken
      }
    };

    const responseText = UrlFetchApp.fetch(url, options);
    const allData = JSON.parse(responseText);
    Logger.log(allData);

    if(allData["response"] == null) {
      throw ("Things did not go well. There is no 'response' entry in the response text: "+responseText);
    }
    const innerData = allData["response"];
    //Logger.log(innerData);

    if(innerData["time_series"] == null || innerData["time_series"].length ==0) {
      throw ("Things did not go well. There is no 'time_series' entry in the response text: "+responseText);
    }
    const numRows = innerData["time_series"].length;
    Logger.log("Got " + numRows + " rows of data, but will use just the last one to get the last day's data.");
    const data = innerData["time_series"][numRows-1];
    //Logger.log(data);
    return data;
  } catch (e) {
    Logger.log("The Tesla API call "+url+" failed. See the error below for more info.");
    throw e;
  }
}

/**
 * Calls the Tesla API at "https://auth.tesla.com/oauth2/v3/token".
 * Passes the "refresh_token" and gets a new "access_token",
 * which will be used in all the rest of the API calls here.
 * The refresh_token is still good for future use; the access_token is valid for only a few hours. 
 */
function getNewAccessToken(refreshToken, emailRecipientsIfFailed) {
  /*
  # Analogy using linux command line:
  export refresh_token=...
  curl -i -X POST https://auth.tesla.com/oauth2/v3/token \
    -H "Content-Type: application/json" \
    -d "{\"grant_type\":\"refresh_token\",\"client_id\":\"ownerapi\",\"refresh_token\":\"$refresh_token\",\"scope\":\"openid email offline_access\"}"
  */
  try {
    const url = "https://auth.tesla.com/oauth2/v3/token";
    const request = {
      "grant_type": "refresh_token",
      "client_id": "ownerapi",
      "refresh_token": refreshToken,
      "scope": "openid email offline_access"
    };
    const options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(request)
    };
    const response = UrlFetchApp.fetch(url, options);
    // Logger.log("The getNewAccessToken http response was: "+response);
    // Sample response:  {refresh_token=aaaaa, expires_in=28800.0, access_token=bbbbb, id_token=ccccc, token_type=Bearer} 
    // Note: the access_token being returned is the same as the one being sent in the request.
    var data = JSON.parse(response);
    var accessToken = data["access_token"];
    Logger.log("Got new access token: "+accessToken);
    return accessToken;
  } catch (e) {
    Logger.log("The Tesla Solar Watch Apps Script could not access your data at Tesla.com. Most likely your refresh token has expired and needs to be renewed. Check your email for instructions how to fix it.");
    MailApp.sendEmail({
      to: emailRecipientsIfFailed,
      subject: "The Tesla Solar Watch Apps Script could not access your data at Tesla.com. Most likely your refresh token has expired and needs to be renewed. Read on.",
      htmlBody: "The Tesla Solar Watch <a href='https://script.google.com/home/projects/" + ScriptApp.getScriptId() + "'>Apps Script</a> could not access your data at Tesla.com. <br>"+
        "TODO: Explain how to get a new refresh token here.",
      });
    
    throw e;
  }
}

/**
 * The email contains a link to the spreadsheet, but its URL has been cooked (by calling this function)
 * to contain the spreadsheet tab and row. This is useful if the user has added more tabs to this spreasheet: 
 * clicking the link in the email will open exactly the tab with the data.
 */
function composeSpreadsheetTabUrl(spreadsheetUrl, tabId, rowNumber) {
  const indexOfGid = spreadsheetUrl.indexOf("#gid=");
  if(indexOfGid == -1) {
    return spreadsheetUrl + "#gid=" + tabId + "&range="+rowNumber+":"+rowNumber;
  } else {
    // Replace the current ...#gid=... in the spreadheet url with a new one that is a link to the tabId that we want:
    return spreadsheetUrl.substring(0, indexOfGid + 5) + "#gid=" + tabId + "&range="+rowNumber+":"+rowNumber;
  }
}


/**
 * Composes and sends the alert email.
 */
function sendAlertEmail(numWatsGeneratedLastDay, alertThresholdWatts, emailRecipients, spreadsheetUrl) {
  const emailsLeft = MailApp.getRemainingDailyQuota();
  Logger.log(emailsLeft + " emails left in today's emails-to-send quota.");

  const emailBody = "See more details in the <a href='" + spreadsheetUrl + "'>spreadsheet</a>. <br>"+
    "This email was sent by the Tesla Solar Watch AppsScript project <a href='https://script.google.com/home/projects/" + ScriptApp.getScriptId() + "'>here</a>.<br>"+
    "This project is owned and managed by the email sender.";
  MailApp.sendEmail({
    to: emailRecipients,
    subject: "Alert: In the last day my Tesla solar system generated "+numWatsGeneratedLastDay+" Watts, which is below my alert threshold of "+alertThresholdWatts+" Watts!",
    htmlBody: emailBody,
  });
  Logger.log("Sent alert email(s) to "+emailRecipients);
}

