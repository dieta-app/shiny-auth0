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

const checkAllowedRoles = (userRoles, appRoles) => {
  return (appRoles || []).some(role => {
    return userRoles.includes(role);
  });
};

const checkInsufficientRoles = user => {
  if (
    env.ROLE_SCOPE_REQUIREMENT &&
    env.ROLE_SCOPE_REQUIREMENT.trim()
      .replace(/['"]+/g, "")
      .split(",").length
  ) {
    const roles = env.ROLE_SCOPE_REQUIREMENT.trim()
      .replace(/['"]+/g, "")
      .split(",");
    if (
      !user[env.ROLE_SCOPE] ||
      !checkAllowedRoles(user[env.ROLE_SCOPE], roles)
    ) {
      if (env.LOGOUT_AUTH0 === "true") {
        logoutUrl =
          "https://" +
          env.AUTH0_DOMAIN +
          "/v2/logout?returnTo=" +
          env.LOGOUT_URL +
          "&client_id=" +
          env.AUTH0_CLIENT_ID +
          (env.LOGOUT_FEDERATED === "true" ? "&federated" : "") +
          "&error=" +
          "Permission Denied" +
          "&error_description=" +
          "Insufficient Permissions to access resource";
        return logoutUrl;
      }
      return true;
    }
    return false;
  }
};

// This adds support for the current way to sso
const authenticateWithDefaultPrompt = passport.authenticate("auth0", {
  scope: `openid idToken permissions profile ${env.ROLE_SCOPE}`
});
const authenticateWithPromptNone = passport.authenticate("auth0", {
  scope: `openid idToken permissions profile ${env.ROLE_SCOPE}`,
  prompt: "none"
});

/* GET home page. */
router.get("/", function(req, res, next) {
  res.redirect(`/secure/?sid=${req.sessionID}`);
});

router.get(
  "/login",
  async function(req, res, next) {
    if (env.CHECK_SESSION === "true" && req.query.sso !== "false") {
      return authenticateWithPromptNone(req, res, next);
    }
    return authenticateWithDefaultPrompt(req, res, next);
  },
  async function(req, res) {
    const exists = await getAsync(req.sessionID);
    if (!exists) {
      await setAsync(req.sessionID, JSON.stringify(req.session), "EX", 86400);
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

  req.session.destroy();
  req.logOut();
  return res.redirect(logoutUrl);
});

router.get("/callback", function(req, res, next) {
  passport.authenticate(
    "auth0",
    {
      scope: `openid idToken permissions profile ${env.ROLE_SCOPE}`
    },
    async function(err, user, info) {
      if (err) {
        next(err);
      }
      if (info === "login_required") {
        return res.redirect("/login?sso=false");
      }

      if (user) {
        const badPermissions = checkInsufficientRoles(user);
        if (badPermissions) {
          req.session.destroy();
          req.logOut();
          if (typeof badPermissions === "string") {
            return res.redirect(badPermissions);
          } else {
            return res.redirect("/login?sso=false");
          }
        } else {
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
                86400
              );
            }
            res.redirect(
              req.session.returnTo || `/secure/?sid=${req.sessionID}`
            );
          });
        }
      }

      next(new Error(info));
    }
  )(req, res, next);
});

module.exports = router;
