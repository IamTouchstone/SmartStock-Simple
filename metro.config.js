// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Block server-only Node.js packages from being bundled into the React Native app.
// These are used exclusively by server.js and must not appear in the mobile bundle.
const SERVER_ONLY_MODULES = [
  'firebase-admin',
  '@google-cloud/firestore',
  'express',
  'pdfkit',
  'nodemailer',
  'fontkit',
  'linebreak',
  'png-js',
];

config.resolver = config.resolver || {};
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SERVER_ONLY_MODULES.some(m => moduleName === m || moduleName.startsWith(m + '/'))) {
    return { type: 'empty' };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
