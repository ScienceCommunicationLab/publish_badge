import { Context } from '@netlify/functions';

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

// List of allowed badge_class_ids.
const validBadgeClassIds: string[] = [
  "g_AMm-vOSC6q4_oB2EMwKw",
  "HNPDHnahQpSJfHMkRFQY4g",
  "o1tF48xdR0CKvJKgsHi2cw",
  "c87tAYNdSVWTlWijeG-HOg",
  "I1Hjg23QT-KoWGAMwh99QA",
  "Ke0RMbahQVePBuxbjaAUwA",
  "q4zbMxLMRUetYmFLp023KA",
  "2DowutSbQaaBEKSxg2VNUQ",
];

export default async (request: Request, context: Context) => {
  console.log("Handler invoked. Starting execution...");

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
  let fullName = params.get("full_name");
  let badgeClassId = params.get("badge_class_id");

  // Sanitize the inputs.
  if (studentEmail) {
    studentEmail = sanitizeEmail(studentEmail);
  }
  if (fullName) {
    fullName = sanitizeString(fullName);
  }
  if (badgeClassId) {
    badgeClassId = badgeClassId.trim();
  }

  console.log(
    `Parsed and sanitized form data: email=${studentEmail}, full_name=${fullName}, badge_class_id=${badgeClassId}`
  );

  if (!studentEmail || !fullName || !badgeClassId) {
    console.log("Missing email, full name, or badge_class_id after sanitation.");
    return new Response("Missing email, full name, or badge_class_id.", { status: 400 });
  }

  if (!isValidEmail(studentEmail)) {
    console.log("Invalid email format.");
    return new Response("Invalid email format.", { status: 400 });
  }

  // Validate badge_class_id.
  if (!validBadgeClassIds.includes(badgeClassId)) {
    console.log("Invalid badge_class_id provided.");
    return new Response("Invalid badge_class_id.", { status: 400 });
  }

  // Load Badgr credentials.
  const BADGR_USERNAME = "courses@ibiology.org"; // Hardcoded in this example.
  const BADGR_PASSWORD = process.env.BADGR_PASSWORD;

  if (!BADGR_USERNAME || !BADGR_PASSWORD) {
    console.log("Badgr credentials not configured properly.");
    return new Response("Badgr credentials not configured.", { status: 500 });
  }

  console.log("Badgr credentials loaded.");

  // ---------------------------------
  // Step 1: Obtain the access token
  // ---------------------------------
  const tokenUrl = "https://api.badgr.io/o/token";
  const tokenHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const tokenBody = new URLSearchParams();
  tokenBody.append("username", "courses@ibiology.org");
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
    },
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
  // Step 3: (Deferred) Email the badge link to the student
  // ---------------------------------
  console.log("Email sending is postponed for now.");
  // If you later implement email sending, call your sendEmail() function here.
  // await sendEmail(studentEmail, openBadgeId);

  console.log("Handler execution completed successfully.");
  return new Response(
    "Submission received. Please watch your email for your notification of your badge creation.",
    { status: 200 }
  );
};
