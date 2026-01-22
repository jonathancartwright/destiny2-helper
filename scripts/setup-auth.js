#!/usr/bin/env node
/**
 * Bungie OAuth Setup Script
 *
 * Usage:
 *   node scripts/setup-auth.js <authorization_code>
 *
 * Or to get a new auth code:
 *   node scripts/setup-auth.js --authorize
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  apiKey: '6a153957f81b44b5ae6bdd5be5a2b6c9',
  clientId: '51424',
  clientSecret: 'bFcJmQEOG8kAmwSUjmD4Pjd-p0WQVVPeDzVnVT3KnNk',
};

function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function exchangeCode(authCode) {
  console.log('Exchanging authorization code for tokens...\n');

  const postData = new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
  }).toString();

  const response = await httpsRequest({
    hostname: 'www.bungie.net',
    path: '/platform/app/oauth/token/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'X-API-Key': CONFIG.apiKey,
    },
  }, postData);

  if (response.status !== 200) {
    console.error('Token exchange failed:', response.data);
    process.exit(1);
  }

  return response.data;
}

async function getMemberships(accessToken) {
  console.log('Fetching membership info...\n');

  const response = await httpsRequest({
    hostname: 'www.bungie.net',
    path: '/Platform/User/GetMembershipsForCurrentUser/',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-API-Key': CONFIG.apiKey,
    },
  });

  if (response.status !== 200 || response.data.ErrorCode !== 1) {
    console.error('Failed to get memberships:', response.data);
    return null;
  }

  return response.data.Response;
}

function updateEnvFile(tokens, membership) {
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  const updates = {
    'BUNGIE_ACCESS_TOKEN': tokens.access_token,
    'BUNGIE_REFRESH_TOKEN': tokens.refresh_token,
    'BUNGIE_TOKEN_EXPIRY': Date.now() + (tokens.expires_in * 1000),
  };

  if (membership) {
    // Find the primary Destiny membership (prefer Steam/Epic/Xbox/PlayStation)
    const destinyMemberships = membership.destinyMemberships || [];
    const primary = destinyMemberships.find(m => m.crossSaveOverride === m.membershipType)
                 || destinyMemberships[0];

    if (primary) {
      updates['BUNGIE_MEMBERSHIP_TYPE'] = primary.membershipType;
      updates['BUNGIE_MEMBERSHIP_ID'] = primary.membershipId;
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (envContent.match(regex)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, envContent.trim() + '\n');
  console.log(`Updated ${envPath}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--authorize') || args.length === 0) {
    const authUrl = `https://www.bungie.net/en/OAuth/Authorize?client_id=${CONFIG.clientId}&response_type=code`;
    console.log('Open this URL in your browser to authorize:\n');
    console.log(authUrl);
    console.log('\nAfter authorizing, run:');
    console.log('  node scripts/setup-auth.js <code_from_redirect_url>');
    return;
  }

  const authCode = args[0];

  try {
    // Exchange code for tokens
    const tokens = await exchangeCode(authCode);
    console.log('Token exchange successful!');
    console.log(`  Access token expires in: ${tokens.expires_in} seconds`);
    console.log(`  Membership ID: ${tokens.membership_id}`);
    console.log('');

    // Get membership details
    const membership = await getMemberships(tokens.access_token);

    if (membership) {
      console.log('Destiny Memberships found:');
      for (const m of membership.destinyMemberships || []) {
        const platformNames = {
          1: 'Xbox',
          2: 'PlayStation',
          3: 'Steam',
          4: 'Blizzard',
          5: 'Stadia',
          6: 'Epic',
          10: 'Demon',
          254: 'BungieNext',
        };
        console.log(`  - ${platformNames[m.membershipType] || m.membershipType}: ${m.displayName} (${m.membershipId})`);
      }
      console.log('');
    }

    // Update .env file
    updateEnvFile(tokens, membership);

    console.log('\nSetup complete! Your .env file has been updated.');
    console.log('You can now use the Destiny 2 Vault Curator MCP server.');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
