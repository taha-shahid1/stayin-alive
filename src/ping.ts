import { Redis } from '@upstash/redis'
import * as fs from 'fs'
import 'dotenv/config'

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

async function ping() {
    const startTime = Date.now()
    const timestamp = new Date().toISOString()
    const endpoint = process.env.ENDPOINT_URL!
    const authHeader = process.env.AUTH_HEADER!

    // Load expected response
    const expectedPath = './src/expected.json'
    const expectedResponse = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'))

    try {
        // Make request
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
        })

        const latency = Date.now() - startTime

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const actualResponse = await response.json()

        // Simple JSON string comparison
        const expectedJson = JSON.stringify(expectedResponse)
        const actualJson = JSON.stringify(actualResponse)
        const matched = expectedJson === actualJson

        const result = {
            timestamp,
            endpoint,
            latency_ms: latency,
            status: matched ? 'success' : 'failure',
            matched,
            error: matched ? undefined : 'Response does not match expected JSON'
        }

        if (!matched) {
            console.log('Response mismatch')
            console.log('Expected:', expectedJson)
            console.log('Actual:', actualJson)
        }

        // Log to Redis
        const key = `monitor:${Date.now()}`
        await redis.setex(key, 86400, latency.toString())
        await redis.set('monitor:latest', latency.toString())
        await redis.incr(`monitor:total:${result.status}`)

    } catch (error: any) {
        const latency = Date.now() - startTime
        const result = {
            timestamp,
            endpoint,
            latency_ms: latency,
            status: 'failure' as const,
            matched: false,
            error: error.message || 'Unknown error'
        }

        console.log(`Request failed: ${result.error}`)
        console.log(`Latency: ${latency}ms`)

        // Log failure to Redis
        const key = `monitor:${Date.now()}`
        await redis.setex(key, 86400, JSON.stringify(result))
        await redis.set('monitor:latest', JSON.stringify(result))
        await redis.incr('monitor:total:failure')

        console.log('Failure logged to Redis')
    }
}

ping().catch(console.error)