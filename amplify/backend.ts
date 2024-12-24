import path from 'path'

import { defineBackend } from '@aws-amplify/backend'

import { Duration } from 'aws-cdk-lib'
import { SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'

const backend = defineBackend({})

const vpcStack = backend.createStack('vpc')

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

const lambda = new NodejsFunction(vpcStack, 'myLambda', {
  entry: path.join(__dirname, 'functions', 'get-ip', 'handler.ts'),
  runtime: Runtime.NODEJS_20_X,
  timeout: Duration.seconds(30),
  vpc: vpc,
  vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
  securityGroups: [lambdaSecurityGroup],
})

backend.addOutput({
  custom: {
    'vpc-lambda-fn-name': lambda.functionName,
  }
})
