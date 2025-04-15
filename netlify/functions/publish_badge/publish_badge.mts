import { Context } from '@netlify/functions';
import { GoogleAuth } from 'google-auth-library';

// Helper function to sanitize a string by trimming whitespace
// and removing any characters except letters, numbers, spaces,
// apostrophes, or hyphens.
function sanitizeString(s: string): string {
  return s.trim().replace(/[^\w\s'-]/g, "");
}

// Helper function to sanitize an email by trimming and lowercasing.
function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Basic email validation using a regular expression.
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;
  return emailRegex.test(email);
}

// New helper function to sanitize full_name and restrict its length.
function sanitizeFullName(s: string): string {
  const safeString = sanitizeString(s);
  // Limit string to a maximum of 100 characters.
  return safeString.substring(0, 100);
}

// Mapping from badge class ID to the corresponding Canvas course ID.
const badgeClassToCourseId: { [badgeClassId: string]: string } = {
  "g_AMm-vOSC6q4_oB2EMwKw": "11346608", // PYSJ_SP
  "HNPDHnahQpSJfHMkRFQY4g": "11346612", // LE_SP
  "o1tF48xdR0CKvJKgsHi2cw": "1346616",  // BCLS_SP
  "c87tAYNdSVWTlWijeG-HOg": "11346595", // SYR_SP
  "I1Hjg23QT-KoWGAMwh99QA": "11229309", // SEPE_SP
  "Ke0RMbahQVePBuxbjaAUwA": "11176634", // BYRC_SP
  "q4zbMxLMRUetYmFLp023KA": "11275476", // CPECS_SP
  "2DowutSbQaaBEKSxg2VNUQ": "11276029", // TSP_SP
};

// Mapping from badge class ID to the expected access code for that course.
const badgeClassToAccessCode: { [badgeClassId: string]: string } = {
  "g_AMm-vOSC6q4_oB2EMwKw": "PYSJ_415_GH",  // PYSJ_SP
  "HNPDHnahQpSJfHMkRFQY4g": "LE_628_BG",    // LE_SP
  "o1tF48xdR0CKvJKgsHi2cw": "BCLS_650_R6",  // BCLS_SP
  "c87tAYNdSVWTlWijeG-HOg": "SRY_535_3K",   // SYR_SP
  "I1Hjg23QT-KoWGAMwh99QA": "SEPE_6134_OG", // SEPE_SP
  "Ke0RMbahQVePBuxbjaAUwA": "BYRC_523_RA",  // BYRC_SP
  "q4zbMxLMRUetYmFLp023KA": "CPECS_061_S9", // CPECS_SP
  "2DowutSbQaaBEKSxg2VNUQ": "TSP_BR5_15",   // TSP_SP
};

// Helper function to send an email via Postmark.
async function sendEmail(to: string, badgeUrl: string): Promise<void> {
  const postmarkUrl = "https://api.postmarkapp.com/email";
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  if (!postmarkToken) {
    throw new Error("Postmark server token is not configured.");
  }
  const emailPayload = {
    From: "courses@ibiology.org", // Adjust as needed.
    To: to,
    Subject: "Your Course Completion Badge is Ready!",
    TextBody: `Congratulations! Your badge is available here: ${badgeUrl}`,
    HtmlBody: `<p>Congratulations!</p><p>Your badge is available <a href="${badgeUrl}">here</a>.</p>`
  };

  const postmarkResponse = await fetch(postmarkUrl, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": postmarkToken,
    },
    body: JSON.stringify(emailPayload)
  });

  if (!postmarkResponse.ok) {
    const errorText = await postmarkResponse.text();
    throw new Error(`Postmark API error: ${postmarkResponse.status} - ${errorText}`);
  }
  console.log("Email sent successfully via Postmark.");
}

/**
 * Helper function to get an OAuth2 access token for Google Sheets using a service account.
 * It expects the entire JSON service account credentials to be stored in the
 * environment variable GOOGLE_SERVICE_ACCOUNT_JSON.
 */
async function getGoogleSheetsAccessToken(): Promise<string> {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  }
  const serviceAccount = JSON.parse(serviceAccountJson);

  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();

  if (!tokenResponse || !tokenResponse.token) {
    throw new Error("Failed to obtain Google Sheets access token.");
  }

  console.log(`Obtained Google Sheets token: ${tokenResponse.token.substring(0, 20)}...`);
  return tokenResponse.token;
}

// Updated helper function to append a row to a Google Sheet with an extra cell for the current time.
async function appendToGoogleSheet(fullName: string, email: string, badgeUrl: string, timestamp: string): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error("Google Sheet ID is missing from configuration.");
  }

  // Generate a valid access token using the service account credentials.
  const googleToken = await getGoogleSheetsAccessToken();

  // Adjust the range to include a fourth column (A:D) for the current time.
  const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:D:append?valueInputOption=USER_ENTERED`;
  const sheetPayload = {
    values: [
      [fullName, email, badgeUrl, timestamp]
    ]
  };

  const sheetResponse = await fetch(sheetsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${googleToken}`,
    },
    body: JSON.stringify(sheetPayload)
  });

  if (!sheetResponse.ok) {
    const errorText = await sheetResponse.text();
    throw new Error(`Google Sheets API error: ${sheetResponse.status} - ${errorText}`);
  }
  console.log("Google Sheet updated successfully.");
}

export default async (request: Request, context: Context) => {
  console.log("Handler invoked. Starting execution...");

  // ---------------------------------
  // Step 0: Check the request's origin or referer.
  // Only allow requests coming from https://publishbadge.netlify.app
  // ---------------------------------
  const originHeader = request.headers.get("origin") || request.headers.get("referer");
  if (!originHeader || !originHeader.startsWith("https://publishbadge.netlify.app")) {
    console.log("Request must come from https://publishbadge.netlify.app.", { received: originHeader });
    return new Response("Forbidden", { status: 403 });
  }

  // ---------------------------------
  // Validate Request Method and Body
  // ---------------------------------
  if (request.method !== "POST") {
    console.log("Received non-POST request.");
    return new Response("Method Not Allowed", { status: 405 });
  }

  console.log("Received POST request.");

  const bodyText = await request.text();
  if (!bodyText) {
    console.log("No request body received.");
    return new Response("Missing request body", { status: 400 });
  }

  // Parse form data using URLSearchParams.
  const params = new URLSearchParams(bodyText);
  let studentEmail = params.get("email");
  let badgeClassId = params.get("badge_class_id");
  let accessCode = params.get("access_code");
  let fullName = params.get("full_name");

  // Sanitize the inputs.
  if (studentEmail) {
    studentEmail = sanitizeEmail(studentEmail);
  }
  if (badgeClassId) {
    badgeClassId = badgeClassId.trim();
  }
  if (accessCode) {
    accessCode = sanitizeString(accessCode);
  }
  if (fullName) {
    // Use the new helper to both sanitize and limit the input.
    fullName = sanitizeFullName(fullName);
  }

  console.log(
    `Parsed and sanitized form data: email=${studentEmail}, badge_class_id=${badgeClassId}, access_code=${accessCode}, full_name=${fullName}`
  );

  if (!studentEmail || !badgeClassId || !accessCode || !fullName) {
    console.log("Missing required form data (email, badge_class_id, access_code, or full_name) after sanitation.");
    return new Response("Missing required form data.", { status: 400 });
  }

  if (!isValidEmail(studentEmail)) {
    console.log("Invalid email format.");
    return new Response("Invalid email format.", { status: 400 });
  }

  // Validate badge_class_id using the course mapping.
  const expectedCourseId = badgeClassToCourseId[badgeClassId];
  if (!expectedCourseId) {
    console.log("Invalid badge_class_id provided.");
    return new Response("Invalid badge_class_id.", { status: 400 });
  }

  // Validate the access code for the provided badge_class_id.
  const expectedAccessCode = badgeClassToAccessCode[badgeClassId];
  if (!expectedAccessCode) {
    console.log("No access code mapping found for badge_class_id:", badgeClassId);
    return new Response("Internal configuration error", { status: 500 });
  }
  if (accessCode !== expectedAccessCode) {
    console.log("Invalid access code provided for badge_class_id:", badgeClassId);
    return new Response("Invalid access code.", { status: 403 });
  }

  // ---------------------------------
  // Load Badgr credentials.
  // ---------------------------------
  const BADGR_USERNAME = "courses@ibiology.org"; // Hardcoded in this example.
  const BADGR_PASSWORD = process.env.BADGR_PASSWORD;

  if (!BADGR_USERNAME || !BADGR_PASSWORD) {
    console.log("Badgr credentials not configured properly.");
    return new Response("Badgr credentials not configured.", { status: 500 });
  }

  console.log("Badgr credentials loaded.");

  // ---------------------------------
  // Step 1: Obtain the access token from Badgr
  // ---------------------------------
  const tokenUrl = "https://api.badgr.io/o/token";
  const tokenHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const tokenBody = new URLSearchParams();
  tokenBody.append("username", BADGR_USERNAME);
  tokenBody.append("password", BADGR_PASSWORD);

  console.log(`Requesting access token from ${tokenUrl}...`);
  let accessToken: string;

  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: tokenHeaders,
      body: tokenBody.toString(),
    });
    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`HTTP status ${tokenResponse.status} - ${errText}`);
    }
    const tokenJson = await tokenResponse.json();
    accessToken = tokenJson?.access_token;
    if (!accessToken) {
      console.log("Access token not found in token response.");
      return new Response("Failed to retrieve access token from Badgr.", { status: 500 });
    }
    console.log("Access token retrieved successfully.");
  } catch (e: any) {
    console.log(`Error obtaining access token: ${e.message}`);
    return new Response(`Error obtaining access token: ${e.message}`, { status: 500 });
  }

  // ---------------------------------
  // Step 2: Create the badge
  // ---------------------------------
  const badgeEndpoint = `https://api.badgr.io/v2/badgeclasses/${badgeClassId}/assertions`;
  const badgeHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  const badgePayload = {
    recipient: {
      identity: studentEmail,
      hashed: true,
      type: "email",
      salt: "12345",
    }
  };

  console.log(
    `Creating badge for ${studentEmail} using badge_class_id=${badgeClassId} at ${badgeEndpoint} ...`
  );

  let openBadgeId: string;
  try {
    const badgeResponse = await fetch(badgeEndpoint, {
      method: "POST",
      headers: badgeHeaders,
      body: JSON.stringify(badgePayload),
    });
    if (!badgeResponse.ok) {
      const errText = await badgeResponse.text();
      throw new Error(`HTTP status ${badgeResponse.status} - ${errText}`);
    }
    const badgeJson = await badgeResponse.json();
    console.log(`Badge creation response: ${JSON.stringify(badgeJson)}`);
    const badgeResults = badgeJson?.result;
    if (!badgeResults || !Array.isArray(badgeResults) || badgeResults.length === 0) {
      throw new Error("Unexpected badge response format");
    }
    openBadgeId = badgeResults[0].openBadgeId;
    if (!openBadgeId) {
      throw new Error("Badge URL not found in response");
    }
    console.log(`Badge created successfully. Badge URL: ${openBadgeId}`);
  } catch (e: any) {
    console.log(`Error creating badge: ${e.message}`);
    return new Response(`Error creating badge: ${e.message}`, { status: 500 });
  }

  // ---------------------------------
  // Step 3: Email the badge link to the student via Postmark
  // ---------------------------------
  try {
    await sendEmail(studentEmail, openBadgeId);
  } catch (e: any) {
    console.log(`Error sending email: ${e.message}`);
    // Optionally, you can handle the email failure differently.
  }

  // ---------------------------------
  // Step 4: Add a row to Google Sheet with full_name, email, badge URL, and current time
  // ---------------------------------
  try {
    const currentTime = new Date().toISOString();
    await appendToGoogleSheet(fullName, studentEmail, openBadgeId, currentTime);
  } catch (e: any) {
    console.log(`Error updating Google Sheet: ${e.message}`);
    // Optionally, handle the sheet update failure.
  }

  console.log("Handler execution completed successfully.");
  return new Response(
    "Submission received. Please watch your email for notification of your badge creation.",
    { status: 200 }
  );
};
