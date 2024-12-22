# Tutorial: Amplify Next.js project with API Lambda that has a static IP address
We have a Next.js app deployed using AWS Amplify. The app needs to call a payment API, but that API only accepts calls from a set of whitelisted IP addresses. This presents a challenge since Amplify is designed to use serverless Lambdas for backend code execution, and Lambdas are not guaranteed static IP addresses. This tutorial shows how to add a customized VPC with a NAT gateway to solve that challenge.

## 1. Set up a barebone app
First step is to set up a barebone Next.js project (`npx create-next-app@latest`).

[Set up your local environment for Amplify development](https://docs.amplify.aws/nextjs/start/account-setup/) if you haven't done so before. We will manually create a sample Amplify backend according to Amplify's [tutorial](https://docs.amplify.aws/nextjs/start/manual-installation/#manual-setup). The tutorial defines a backend consisting of a database (DynamoDB) and an authentication service (Cognito). We won't use either one for this tutorial, but we'll create them anyways to make a familiar folder structure.

At this point you should be able to locally start you backend (`npx ampx sandbox`) in one terminal while starting the frontend (`npm run dev`) in another. The two are not connected (yet).