# Tutorial: Amplify Next.js app with Lambda that makes outbound calls from static IP addresses
We have a Next.js app deployed using AWS Amplify. The app needs to call a payment API, but that API only accepts calls from a set of whitelisted IP addresses. This presents a challenge since Amplify is designed to use serverless Lambdas for backend code execution, and Lambdas are not guaranteed static IP addresses. This tutorial shows how to add a customized VPC with a NAT gateway to solve that problem.

## 1. Set up a Amplify Next.js app
Step 1 and 2 are just to set up a barebone app. First initialize a Next.js project for the frontend: `npx create-next-app@latest`.

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

## 2. Create a server action
In a typical Next.js app, business logic is executed in server actions. E.g., a server action may handle a payment request by updating databases and making third-party calls. For this tutorial, our server action will just make an API call to retrieve its own IP address. Create a file `app/actions.ts`:
```js
'use server'

export async function getIP() {
  return fetch('https://api.ipify.org?format=json')
    .then(res => res.json())
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
    getIP().then(json => json && setIP(json.ip))
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

const lambda = new NodejsFunction(vpcStack, 'vpcLambda', {
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

Once you've run `npx ampx sandbox` to deploy this new backend, open `amplify_outputs.json` to find the function name of the deployed Lambda. Look it up in your AWS [Lambda dashboard](console.aws.amazon.com/lambda/home). Navigate to the dashboard for that Lambda and do a test run to see that it can retrieve its own IP address. The result should be an IP address owned by AWS.

## 4. Set the Lambda in its own VPC
So far our code has used names like "vpcStack" and "vpcLambda," those are just names for human reference. We haven't created a VPC yet. Let's make one now with mostly default settings and put our Lambda in it. Update `backend.ts`:
```js
import { SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2'

...

const vpc = new Vpc(vpcStack, 'LambdaVpc', {
  subnetConfiguration: [
    {
      name: 'Isolated',
      subnetType: SubnetType.PRIVATE_ISOLATED,
    },
    {
      name: 'Private',
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    },
    {
      name: 'Public',
      subnetType: SubnetType.PUBLIC,
    },
  ],
})

const lambdaSecurityGroup = new SecurityGroup(
  vpcStack,
  'Lambda Security Group',
  { vpc: vpc }
)

const lambda = new NodejsFunction(vpcStack, 'vpcLambda', {
  ...
  vpc: vpc,
  vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
  securityGroups: [lambdaSecurityGroup],
})

...
```

Go back to the Lambda dashboard and test the Lambda again, you'll see the Lambda's IP address has changed. Now go to the AWS VPC dashboard and select the ["Elastic IPs"](https://console.aws.amazon.com/vpcconsole/home?#Addresses:) tab. You'll see two EIP addresses there, one of which is the IP address you saw when running the Lambda.

So here's what happened underneath. When we instantiated a VPC with `Vpc()`, we specified three subnet configurations (`Public`, `Private`, `Isolated`) and left the number of availability zones (AZ) unspecified, which defaults to 2. That means we have a total of six subnets. E.g., there are two public subnets, one in each AZ. Similarly there are also two private subnets and two isolated subnets.

The generated VPC also, by default, includes a NAT gateway with one Elastic IP (EIP) address automatically provisioned for each public subnet. Thus you see two EIP addresses on the dashboard. Resources within a VPC interacts with the internet through the NAT gateway, which is why you see one of those two EIPs in the Lambda execution result. We shouldn't care which availability zone a Lambda is running in, since by design the Lambda can run in either AZ to improve availability.

## 5. Allocate persistent EIP addresses
Instead of using the automatically provisioned EIPs, we want to use our own that are constant and persistent across various deployments (e.g. multiple dev setups and production). First let's *allocate* our EIP from the ["Elastic IPs"](https://console.aws.amazon.com/vpcconsole/home?#Addresses:) dashboard. We'll need two, one for each availability zone. Note their Allocation IDs. (Obviously, also note their assigned IP addresses.)

Create a `.env` file with those allocation IDs, separated by commas, in an environment variable:
```sh
EIP_ALLOCATION_IDS=eipalloc-xxxxx,eipalloc-yyyyy
```

Install [`dotenv`](https://www.npmjs.com/package/dotenv). Update `backend.ts` to pick up those allocation IDs and replace the auto-generated NAT gateway with our own.
```js
...
import 'dotenv/config'
const eipAllocationIds = process.env.EIP_ALLOCATION_IDS!.split(',')

const vpc = new Vpc(vpcStack, 'LambdaVpc', {
  natGatewayProvider: NatProvider.gateway({ eipAllocationIds }),
  ...
})
```

Run the Lambda again. You'll see that it's calling from one of our allocated IP addresses! We will provide these allocated IP addresses to the third-party payment API for whitelisting.

## 5. Call Lambda from Next.js
Now that we have a Lambda that makes outbound calls from a prescribed set of IP addresses, we need some way of calling that Lambda from within our app. There are a lot of options, such as having the Lambda respond to database events, or listen for messages from SNS. The appropriate choice will depend on your use case. For illustration we will wrap the Lambda inside [Amplify's API framework](https://docs.amplify.aws/nextjs/build-a-backend/add-aws-services/rest-api/set-up-rest-api/), so we can call it like a REST API. This will also allow us to easily re-use [Amplify's auth system](https://docs.amplify.aws/nextjs/build-a-backend/add-aws-services/rest-api/customize-authz/) for access control. For example, if you're using IAM or Cognito for authentication, it's [well documented](https://docs.amplify.aws/nextjs/build-a-backend/add-aws-services/rest-api/customize-authz/) how to add authorization to the API gateway.

Wrapping a Lambda in a REST API is straightforward with the `LambdaRestApi` function. We will make this API publicly accessible and leave it to the reader to add restriction rules. Obviously, DO NOT DEPLOY A PUBLIC API TO PRODUCTION! Afterall, there's certainly a good reason why the API we're wrapping requires IP whitelisting.

Having created an API access point for the Lambda, we'll expose it via `amplify_outputs.json` to our Next.js app. Whereas we previously had outputted the Lambda function name in that file, we now replace it with the new API endpoint. Update `backend.ts` with
```js
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway'

...
const api = new LambdaRestApi(vpcStack, 'restApiForVpcLambda', {
  handler: lambda,
})

backend.addOutput({
  custom: {
    // 'vpc-lambda-fn-name': lambda.functionName,
    API: {
      [api.restApiName]: {
        endpoint: api.url,
        region: vpcStack.region,
      },
    }
  }
})
```

When the new backend is compiled and deployed to the sandbox, you can look inside `amplify_outputs.json` to see what the URL endpoint is. Call it with your browser (or `curl`) and you'll see the Lambda output showing one of your allocated EIP addresses.

Our Next.js app can pick up the URL endpoint directly from `amplify_outputs.json` and call it with standard Javascript `fetch()`. But since we'll likely be using other Amplify frontend libraries, we will use that framework now. Let's create the file `app/amplifyConfig.ts` to configure Amplify frontend with the following [initialization code](https://docs.amplify.aws/nextjs/build-a-backend/add-aws-services/rest-api/set-up-rest-api/#initialize-amplify-api).
```js
import { Amplify } from 'aws-amplify'
import outputs from '@/amplify_outputs.json'

Amplify.configure(outputs)
const existingConfig = Amplify.getConfig()

Amplify.configure({
  ...existingConfig,
  API: {
    ...existingConfig.API,
    REST: outputs.custom.API
  }
})
```

The Amplify configuration above needs to be called before any Amplify function is used. We'll update the entire `app/actions.ts` file to call our Lambda API:
```js
'use server'

import { get } from 'aws-amplify/api';

import './amplifyConfig'

export async function getIP() {
  try {
    const restOperation = get({
      apiName: 'restApiForVpcLambda',
      path: ''
    })
    const response = await restOperation.response
    const json = await response.body.json() as { ip: string }

    return json
  } catch (error) {
    console.log('GET call failed: ', error)
  }
}
```

We're using Amplify's `get` function to [fetch data](https://docs.amplify.aws/nextjs/build-a-backend/add-aws-services/rest-api/fetch-data/) from our Lambda's REST API. Note that we're referring to the API by the name we've given to it (`restApiForVpcLambda`), rather than having to keep track of the URL. Amplify will figure it out based on its configuration.

With all that set up and your frontend running locally, you should be able to go to http://localhost:3000/ in your browser and see that your app is able to access an external API (https://api.ipify.org) from a set of static IP addresses that you control.
