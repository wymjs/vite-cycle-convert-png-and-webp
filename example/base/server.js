import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const server = await createServer({
	root: __dirname,
})
await server.listen()

server.printUrls()
server.bindCLIShortcuts({ print: true })

// process.exit(0)
