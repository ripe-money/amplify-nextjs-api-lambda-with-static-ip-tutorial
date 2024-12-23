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