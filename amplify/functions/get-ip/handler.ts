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
