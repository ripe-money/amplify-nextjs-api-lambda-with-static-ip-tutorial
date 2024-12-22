# Tutorial: Amplify Next.js project with API Lambda that has a static IP address
We have a Next.js app deployed using AWS Amplify. The app needs to call a payment API, but that API only accepts calls from a set of whitelisted IP addresses. This presents a challenge since Amplify is designed to use serverless Lambdas for backend code execution, and Lambdas are not guaranteed static IP addresses. This tutorial shows how to add a customized VPC with a NAT gateway to solve that challenge.

## 1. Set up a barebone Amplify Next.js app
First step is to set up a Next.js project for the frontend: `npx create-next-app@latest`.

[Set up your local environment for Amplify development](https://docs.amplify.aws/nextjs/start/account-setup/) if you haven't done so before. We will install the Amplify libraries:
```sh
npm add --save-dev @aws-amplify/backend@latest @aws-amplify/backend-cli@latest typescript
```
Now create a backend (empty for now). Create the file `amplify/backend.ts`:
```js
import { defineBackend } from '@aws-amplify/backend';

defineBackend({});
```

At this point you should be able to locally start you backend (`npx ampx sandbox`) in one terminal while starting the frontend (`npm run dev`) in another.