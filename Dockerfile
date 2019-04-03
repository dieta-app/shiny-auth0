FROM node:11

LABEL maintainer="bneigher@bigdieta.com"

# add workdir
WORKDIR /usr/src/app

# copy app
COPY app/ ./

# install tools
RUN npm install -g npm-check-updates forever

# install package
RUN npm install -y
