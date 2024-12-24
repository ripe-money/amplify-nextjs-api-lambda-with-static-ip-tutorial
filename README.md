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

## 2. Create a barebone server action
In a typical Next.js app, business logic is executed in server actions. E.g., a server action may handle a payment request by updating databases and making third-party calls. For this tutorial, our server action will just make an API call to... retrieve its own IP address. Create a file `app/actions.ts`:
```js
'use server'

export async function getIP() {
  return fetch('https://api.ipify.org?format=json')
    .then(res => res.json())
    .then(data => data.ip)
}
```

And change `app/page.tsx` to call this server action when the page mounts:
```js
'use client'

import { useState, useEffect } from 'react'

import { getIP } from "./actions"

export default function Home() {
  const [ip, setIP] = useState('')

  useEffect(() => {
    getIP().then(ip => setIP(ip))
  }, [])

  return (
    <main>
      <h1>Hello World!</h1>
      <p>IP address of component making API call: {ip}</p>
    </main>
  )
}
```

If you run this locally, you'll notice the IP address shown is the IP address of your location. That is, the server action is running on your local computer. When deployed in production, this server action will be running on an edge server somewhere, ideally close to the user. This is normally a good thing, but we can't call the payment API from the server action since it doesn't have a static IP address to be whitelisted. For that we'll need a Lambda running in a specially configured VPC.

## 3. Create a Lambda using Amplify
Amplify has [built-in support](https://docs.amplify.aws/react/build-a-backend/functions/set-up-function/) for creating Lambdas with its `defineFunction` function. Unfortunately, as of this writing, `defineFunction` [doesn't support building Lambdas with VPC](https://github.com/aws-amplify/amplify-backend/issues/1112). We therefore will build our Lambda using Amplify's [custom resources](https://docs.amplify.aws/react/build-a-backend/add-aws-services/custom-resources/).

First we define a handler for our Lambda. It's functionally similar to our server action earlier. We add a bit more error checking to help debug mistakes we may make later on. Create `amplify/functions/get-ip/handler.ts`:
```js
import type { APIGatewayProxyHandler } from 'aws-lambda'

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('event', event)

  let json = 'Fail to fetch IP address'

  try {
    const response = await fetch('https://api.ipify.org?format=json')
    if (response.ok) {
      json = await response.json()
    }
    else {
      json = response.statusText
    }
  }
  catch (error) {
    if (error instanceof Error) {
      json = error.message
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(json),
  }
}
```

Now update `amplify/backend.ts` to create a Lambda with this handler:
```js
import path from 'path'

import { defineBackend } from '@aws-amplify/backend'

import { Duration } from 'aws-cdk-lib'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'

const backend = defineBackend({})

const vpcStack = backend.createStack('vpc')

const lambda = new NodejsFunction(vpcStack, 'myLambda', {
  entry: path.join(__dirname, 'functions', 'get-ip', 'handler.ts'),
  runtime: Runtime.NODEJS_20_X,
  timeout: Duration.seconds(30),
})

backend.addOutput({
  custom: {
    'vpc-lambda-fn-name': lambda.functionName,
  }
})
```

With custom resources, we bypass the convenience functions provided by Amplify and go one level down to work directly using AWS's CDK. In this case we're using CDK's `NodejsFunction` to create our Lambda.

Information about Amplify's backend is normally summarized in the `amplify_outputs.json` file. The Next.js app will pick up information here for how to interact with the backend. Since Amplify doesn't know the specifics of our custom resource, we will manually append the information using `backend.addOutput()`.

Once you've run `npx ampx sandbox` to deploy this new backend, open `amplify_outputs.json` to find the function name of the deployed Lambda. Look it up in your AWS Lambda dashboard. Navigate to the dashboard for that Lambda and do a test run to see that it can retrieve its own IP address. The result should be an IP address owned by AWS.