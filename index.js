const express = require("express")
const axios = require("axios")
const { Transform } = require("stream")
const { spawn } = require("child_process")

if (!process.env.HDHR_IP) {
  console.log("HDHR_IP environment variable not set")
  process.exit(1)
}

const app = express()
const media = express()

const hdhr = process.env.HDHR_IP
let deviceId = "00ABCDEF"

app.use("/", (req, res, next) => {
  console.log(`App Request: ${req.url}`)
  next()
})

media.use("/", (req, res, next) => {
  console.log(`Media Request: ${req.url}`)
  next()
})

app.use("/", async (req, res, next) => {
  try {
    const response = await axios.get(`http://${hdhr}${req.url}`, {
      responseType: "stream",
    })

    // Copy over all headers
    Object.keys(response.headers).forEach(key => {
      // ...except the content-length header since we may change the length
      if (!key.toLowerCase() === "content-length") res.setHeader(key, response.headers[key])
    })

    // Get the hostname from the request
    const host = req.headers.host.split(":")

    // Transform the stream
    const transform = new Transform({
      transform(chunk, encoding, callback) {
        this.push(
          chunk
            .toString()
            // Reverse the device ID
            .replace(new RegExp(deviceId, "g"), deviceId.split("").reverse().join(""))
            // Swap out the HDHR IP app requests for the emulated host
            .replace(new RegExp(`${hdhr}(?!:)`, "g"), host[1] === "80" ? host[0] : host.join(":"))
            // Swap out the HDHR IP media requests
            .replace(new RegExp(`${hdhr}:5004`, "g"), `${host[0]}:5004`)
            // Switch AC4 to AC3
            .replace(/AC4/g, "AC3")
        )
        callback()
      },
    })

    response.data.pipe(transform).pipe(res)
  } catch (error) {
    next(error)
  }
})

// Error handler
app.use((err, req, res, next) => {
  console.log(err.stack)
  res.sendStatus(500)
})

media.use("/auto/:channel", async (req, res, next) => {
  try {
    // Create a cancel token to end the stream when the client disconnects
    const cancelSource = axios.CancelToken.source()

    // Pipe the stream to the output
    const stream = await axios.get(`http://${hdhr}:5004/auto/${req.params.channel}`, {
      responseType: "stream",
      cancelToken: cancelSource.token,
    })
    if (stream.status === 200) {
      const ffmpeg = spawn("/usr/bin/ffmpeg", [
        "-nostats",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-i",
        "pipe:",
        "-map",
        "0:v",
        "-map",
        "0:a",
        "-c:v",
        "copy",
        "-c:a",
        "ac3",
        "-f",
        "mpegts",
        "-",
      ])

      stream.data.pipe(ffmpeg.stdin)
      ffmpeg.stdout.pipe(res)

      ffmpeg.on("spawn", () => {
        console.debug(`Tuning channel ${req.params.channel}`)
      })

      res.on("error", () => {
        console.log(`Response error. Stopping ${req.params.channel}`)
        cancelSource.cancel()
      })

      res.on("close", () => {
        console.log(`Response disconnected. Stopping ${req.params.channel}`)
        cancelSource.cancel()
      })
    } else {
      console.log(`Error: ${stream.status}`)
      res.sendStatus(stream.status)
    }
  } catch (error) {
    next(error)
  }
})

media.use((err, req, res, next) => {
  console.log(err.stack)
  res.sendStatus(500)
})

// Fetch the device id from the HDHR and then start the server
axios
  .get(`http://${hdhr}/discover.json`)
  .then(response => {
    deviceId = response.data.DeviceID
    console.log(`Device ID: ${deviceId}`)
    if (!deviceId) {
      throw new Error("No device ID found")
    }
  })
  .then(() => {
    app.listen(80, () => {
      console.log("App server listening on port 80")
    })

    media.listen(5004, () => {
      console.log("Media server listening on port 5004")
    })
  })
