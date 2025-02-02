import path from 'path'

import { defineBackend } from '@aws-amplify/backend'

import { Duration } from 'aws-cdk-lib'
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway'
import { SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'

import 'dotenv/config'

const backend = defineBackend({})

const vpcStack = backend.createStack('vpc')

const vpc = Vpc.fromVpcAttributes(vpcStack, 'ImportVPC', {
  vpcId: process.env.VPC_ID!,
  availabilityZones: process.env.AVAILABILITY_ZONES!.split(','),
  privateSubnetIds: process.env.PRIVATE_SUBNET_IDS!.split(','),
})

const lambda = new NodejsFunction(vpcStack, 'vpcLambda', {
  entry: path.join(__dirname, 'functions', 'get-ip', 'handler.ts'),
  runtime: Runtime.NODEJS_20_X,
  timeout: Duration.seconds(30),
  vpc: vpc,
  vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
})

const api = new LambdaRestApi(vpcStack, 'restApiForVpcLambda', {
  handler: lambda,
})

backend.addOutput({
  custom: {
    API: {
      [api.restApiName]: {
        endpoint: api.url,
        region: vpcStack.region,
      },
    }
  }
})
