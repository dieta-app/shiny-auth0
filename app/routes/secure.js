const express = require("express");
const router = express.Router();
const httpProxy = require("http-proxy");
const ensureLoggedIn = require("connect-ensure-login").ensureLoggedIn();
const url = require("url");

var proxy = httpProxy.createProxyServer({
  target: {
    host: process.env.SHINY_HOST,
    port: process.env.SHINY_PORT
  }
});

proxy.on("error", function(e) {
  console.log("Error connecting");
  console.log(e);
});

var setIfExists = function(proxyReq, header, value) {
  if (value) {
    proxyReq.setHeader(header, value);
  }
};

proxy.on("proxyReq", function(proxyReq, req, res, options) {
  setIfExists(proxyReq, "x-auth0-nickname", req.user._json.nickname);
  setIfExists(proxyReq, "x-auth0-user_id", req.session.passport.user.user_id);
  setIfExists(proxyReq, "x-auth0-jwt", req.session.passport.user.jwt);
  setIfExists(proxyReq, "x-auth0-email", req.user._json.email);
  setIfExists(proxyReq, "x-auth0-name", req.user._json.name);
  setIfExists(proxyReq, "x-auth0-picture", req.user._json.picture);
  setIfExists(proxyReq, "x-auth0-locale", req.user._json.locale);
});

// router.all(/.*/, ensureLoggedIn, function(req, res, next) {
//   let forceSID = url.format({
//     protocol: req.protocol,
//     host: req.get("host"),
//     pathname: req.originalUrl
//   });

//   if (res.query && res.query.sid) {
//     if (res.query.sid !== req.sessionID) {
//       forceSID = forceSID.split("?")[0] + `?sid=${req.sessionID}`;
//     }
//   } else {
//     forceSID = forceSID.split("?")[0] + `?sid=${req.sessionID}`;
//   }
// });

/* Proxy all requests */
router.all(/.*/, ensureLoggedIn, function(req, res, next) {
  proxy.web(req, res);
});

module.exports = router;
