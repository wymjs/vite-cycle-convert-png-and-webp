import path from 'path'
import { cycleConvertPngAndWebp } from '@wymjs/vite-cycle-convert-png-and-webp'

export default {
	plugins: [
		cycleConvertPngAndWebp({
			dirs: [path.resolve(process.cwd(), 'public')],
			zipPngImageminOptions: {
				quality: [0.7, 0.7],
			},
		}),
	],
}
