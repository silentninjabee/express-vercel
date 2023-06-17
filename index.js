// init project
const express = require("express");
const nodemailer = require("nodemailer");
const bp = require("body-parser");
const moment = require("moment");
const { Pool, Client } = require("pg");

// Firebase config
const serviceAccount = require("./serviceAccountKey.json");
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// App config
const app = express();
app.use(bp.json());
app.use(bp.urlencoded({ extended: true }));

const port = process.env.PORT || 3000;

const DEFAULT_AVATAR =
  "https://user-images.githubusercontent.com/79369571/182101394-89e63593-11a1-4aed-8ec5-9638d9c62a81.png";

// GUEST
const pool = new Pool({
  connectionString:
    "postgres://Leanhdung2881999:CkXPLgAV6Zj0@calm-truth-683750.cloud.neon.tech/main?options=project%3Dcalm-truth-683750&sslmode=require",
  ssl: {
    rejectUnauthorized: false,
  },
});

// Get user info from database with jwt firebase token
const fetchUserInfo = async (token) => {
  console.log("token", { token });

  try {
    // 1) Extracts token
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log("decodedToken", { decodedToken });

    const { email, uid } = decodedToken;

    // 2) Fetches userInfo in a mock function
    const userRes = await pool.query(
      'SELECT * FROM public."User" WHERE email=$1',
      [email]
    );

    let users = userRes.rows;
    if (!users || users.length === 0) {
      try {
        const insertUserRes = await pool.query(
          'INSERT INTO public."User" (uuid, name, email, avatar) VALUES ($1, $2, $3, $4) RETURNING *',
          [uid, email, email, decodedToken.picture ?? DEFAULT_AVATAR]
        );
        users = insertUserRes.rows;
      } catch (error) {
        const userRes2 = await pool.query(
          'SELECT * FROM public."User" WHERE email=$1',
          [email]
        );

        users = userRes2.rows;
      }
    }

    // 3) Return hasura variables
    return users;
  } catch (error) {
    console.log({ error });
    return error;
  }
};

// GET: Hasura user information
app.get("/", async (request, response) => {
  try {
    // Extract token from request
    let token = request.get("Authorization");
    token = token.replace(/^Bearer\s/, "");

    // Fetch user_id that is associated with this token
    const users = await fetchUserInfo(token);

    let hasuraVariables = {};

    if (users.length > 0) {
      hasuraVariables = {
        "X-Hasura-Role": "user",
        "X-Hasura-User-Id": `${users[0].id}`,
      };
    }

    // Return appropriate response to Hasura
    response.json(hasuraVariables);
  } catch (error) {
    response.json({ error });
  }
});

// GET: trigger webhook get or create user when login
app.get("/webhook", async (request, response) => {
  // Extract token from request
  let token = request.get("Authorization");
  token = token.replace(/^Bearer\s/, "");

  // Fetch user_id that is associated with this token
  const user = await fetchUserInfo(token);

  // response.json({ token, user });

  let hasuraVariables = {};

  if (user.length > 0) {
    hasuraVariables = {
      "X-Hasura-Role": "user",
      "X-Hasura-User-Id": `${user[0].id}`,
    };
  }

  // Return appropriate response to Hasura
  response.json(hasuraVariables);
});

// POST: Callback for sign in with apple
app.post("/callback", async (request, response) => {
  const redirect = `intent://callback?${new URLSearchParams(
    request.body
  ).toString()}#Intent;package=com.investiapp.dev;scheme=signinwithapple;end`;

  response.redirect(307, redirect);
});
