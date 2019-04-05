const express = require("express");
const passport = require("passport");
const httpProxy = require("http-proxy");
const ensureLoggedIn = require("connect-ensure-login").ensureLoggedIn();
const router = express.Router();
const { promisify } = require("util");
const redis = require("redis");

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: 6379
});

const getAsync = promisify(redisClient.get).bind(redisClient);
const setAsync = promisify(redisClient.set).bind(redisClient);
const delAsync = promisify(redisClient.del).bind(redisClient);

redisClient.on("error", function(err) {
  console.log("Error " + err);
});

const env = process.env;

// This adds support for the current way to sso
const authenticateWithDefaultPrompt = passport.authenticate("auth0", {
  scope: "openid profile"
});
const authenticateWithPromptNone = passport.authenticate("auth0", {
  scope: "openid profile",
  prompt: "none"
});

/* GET home page. */
router.get("/", function(req, res, next) {
  res.redirect(`/secure/?sid=${req.sessionID}`);
});

router.get(
  "/login",
  function(req, res, next) {
    if (env.CHECK_SESSION === "true" && req.query.sso !== "false") {
      return authenticateWithPromptNone(req, res, next);
    }
    return authenticateWithDefaultPrompt(req, res, next);
  },
  async function(req, res) {
    const exists = await getAsync(req.sessionID);
    if (!exists) {
      await setAsync(req.sessionID, JSON.stringify(req.session), "EX", 36000);
    }
    res.redirect(`/secure/?sid=${req.sessionID}`);
  }
);

router.get("/logout", async function(req, res) {
  let logoutUrl = env.LOGOUT_URL;
  const exists = await getAsync(req.sessionID);
  if (exists && req.sessionID) {
    await delAsync(req.sessionID);
  }
  if (env.LOGOUT_AUTH0 === "true") {
    logoutUrl =
      "https://" +
      env.AUTH0_DOMAIN +
      "/v2/logout?returnTo=" +
      env.LOGOUT_URL +
      "&client_id=" +
      env.AUTH0_CLIENT_ID +
      (env.LOGOUT_FEDERATED === "true" ? "&federated" : "");
  }

  req.logout();
  res.redirect(logoutUrl);
});

router.get("/callback", function(req, res, next) {
  passport.authenticate("auth0", function(err, user, info) {
    if (err) {
      next(err);
    }
    if (info === "login_required") {
      return res.redirect("/login?sso=false");
    }

    if (user) {
      return req.login(user, async function(err) {
        if (err) {
          next(err);
        }
        const exists = await getAsync(req.sessionID);
        if (!exists) {
          await setAsync(
            req.sessionID,
            JSON.stringify(req.session),
            "EX",
            36000
          );
        }
        res.redirect(req.session.returnTo || `/secure/?sid=${req.sessionID}`);
      });
    }

    next(new Error(info));
  })(req, res, next);
});

module.exports = router;
