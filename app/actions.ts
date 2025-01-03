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
