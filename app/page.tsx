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
