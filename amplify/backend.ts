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
