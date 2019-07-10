const express = require("express");
const path = require("path");
const favicon = require("serve-favicon");
const logger = require("morgan");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const session = require("express-session");
const dotenv = require("dotenv");
const passport = require("passport");
const Auth0Strategy = require("passport-auth0");

dotenv.load();

const routes = require("./routes/index");
const secure = require("./routes/secure");
const logs = require("./routes/logs");

// Default everything to false
process.env.CHECK_SESSION = process.env.CHECK_SESSION || "false";
process.env.LOGOUT_AUTH0 = process.env.LOGOUT_AUTH0 || "false";
process.env.LOGOUT_FEDERATED = process.env.FEDERATED || "false";

if (process.env.LOGOUT_FEDERATED === "true") {
  process.env.LOGOUT_AUTH0 = "true";
}

// This will configure Passport to use Auth0
const strategy = new Auth0Strategy(
  {
    domain: process.env.AUTH0_DOMAIN,
    clientID: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    callbackURL: process.env.AUTH0_CALLBACK_URL,
    state: false
  },
  function(accessToken, refreshToken, extraParams, profile, done) {
    // accessToken is the token to call Auth0 API (not needed in the most cases)
    // extraParams.id_token has the JSON Web Token
    // profile has all the information from the user
    if (
      process.env.ROLE_SCOPE_REQUIREMENT &&
      process.env.ROLE_SCOPE_REQUIREMENT.trim()
        .replace(/['"]+/g, "")
        .split(",").length
    ) {
      if (profile && profile._json) {
        if (profile._json[process.env.ROLE_SCOPE]) {
          profile[process.env.ROLE_SCOPE] =
            profile._json[process.env.ROLE_SCOPE];
        }
      }
    }
    return done(null, profile);
  }
);

passport.use(strategy);

// you can use this section to keep a smaller payload
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

const app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

app.use(logger("dev"));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.COOKIE_SECRET,
    saveUninitialized: true,
    resave: false,
    unset: "destroy",
    cookie: {
      maxAge: 24 * 60 * 60 * 1000 // 1 hour
    }
    // redisStore: this was sting the keys in redis but connections were not showing this data
    // when manually connecting to redis client from node or from R, a different database 0 is shown.
    // forced to manually call redis instead

    // store: new redisStore({
    //   host: process.env.REDIS_HOST || "127.0.0.1",
    //   port: 6379,
    //   client: redisClient,
    //   ttl: 36000
    // })
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, "public")));

app.use("/secure/", secure);
app.use("/logs/", logs);
app.use("/", routes);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get("env") === "development") {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render("error", {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render("error", {
    message: err.message,
    error: {}
  });
});

module.exports = app;
