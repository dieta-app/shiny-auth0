#!/bin/bash

# build
docker build -t dieta/shiny-auth0 .

# verify
if [ "$?" -gt "0" ]; then
  echo "Build errored."
  exit 1
fi

# push
docker push dieta/shiny-auth0:latest
