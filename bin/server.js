#!/usr/bin/env node

/**
 * @type {any}
 */
const WebSocket = require('ws')
const http = require('http')
const crypto = require('crypto')
const { MongoClient } = require('mongodb')
const wss = new WebSocket.Server({ noServer: true })
const setupWSConnection = require('./utils.js').setupWSConnection

const host = process.env.HOST || 'localhost'
const port = process.env.PORT || 1234

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

const mongoURL = process.env.MONGO_URL || 'mongodb://localhost:27017/maestroqa'
const mongo = new MongoClient(mongoURL)

wss.on('connection', setupWSConnection)

function hashToken (loginToken) {
  const hashedToken = crypto.createHash('sha256').update(loginToken).digest('base64')
  console.log(loginToken, hashedToken)
  return hashedToken
}

async function authenticate (request, next) {
  const rawHeaders = request.rawHeaders // an array instead of obj k , v are in successive indexes
  const loginHeaderIndex = request.rawHeaders.indexOf('loginToken')
  if (loginHeaderIndex === -1) {
    next('missing loginToken header')
  }
  const loginToken = rawHeaders[loginHeaderIndex + 1]
  const hashedToken = hashToken(loginToken)
  await mongo.connect()
  const user = await mongo.db('maestroqa').collection('users').findOne({ 'services.resume.loginTokens.hashedToken': hashedToken })
  if (!user) {
    next('user not found')
  }
  next(false, user)
}

// const map = new Map()
server.on('upgrade', async function upgrade (request, socket, head) {
  await authenticate(request, function next (err, user) {
    if (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    // map.set(user._id, wss)
    wss.handleUpgrade(request, socket, head, function done (ws) {
      wss.emit('connection', ws, request)
    })
  })
})

server.listen(port, () => {
  console.log(`running at '${host}' on port ${port}`)
})
