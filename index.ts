import type { Plugin } from 'vite'
import path from 'path'
import fs from 'fs'
import sharp, { type PngOptions, type WebpOptions } from 'sharp'
import imagemin from 'imagemin'
import imageminPngquant, { Options as ImageminPngOptions } from 'imagemin-pngquant'

type CycleConvertPngAndWebpOptions = {
	/** @desc 要轉換的目錄(absolute path) */
	dirs: string[]

	/** @desc 轉換到 webp 的選項配置 */
	toWebpSharpOptions?: WebpOptions

	/** @desc 轉換到 png 的選項配置 */
	formatPngSharpOptions?: PngOptions

	/** @desc 將 zip-png 目錄轉換到 png 目錄下 */
	zipPngImageminOptions?: ImageminPngOptions
}

type SupportExt = 'png' | 'webp'
type GetPathInfoParametersDirname = typeof ZIP_PNG_DIR_NAME | SupportExt
type GetPathInfoParametersObjReturn = {
	dirName: GetPathInfoParametersDirname
	fileExt: SupportExt
	rootDirPath: string
	fileDirPath: string
	noExtFilename: string
}
type GetPathInfoParametersReturn = null | GetPathInfoParametersObjReturn

const SL = path.normalize('/')
const PLUGIN_NAME = '@wymjs/vite-cycle-convert-png-and-webp'
const FULL_PLUGIN_NAME = `vite-plugin-${PLUGIN_NAME}`
const CONSOLE_NAME = `[${PLUGIN_NAME}]`
const ZIP_PNG_DIR_NAME = 'zip-png'

async function _convert(options: CycleConvertPngAndWebpOptions) {
	for (let i = 0; i < options.dirs.length; i++) {
		const dir = options.dirs[i]
		const filenames = await fs.promises.readdir(dir)
		let hasWebpDir = false
		let hasPngDir = false

		for (let j = 0; j < filenames.length; j++) {
			const filename = filenames[j]

			if (filename === 'webp') {
				hasWebpDir = true
			} else if (filename === 'png') {
				hasPngDir = true
			}

			if (hasWebpDir && hasPngDir) break
		}

		const pngDirPath = `${dir}${SL}png`
		const webpDirPath = `${dir}${SL}webp`
		const relativeFilepathExistsMap: Record<string, 1> = {}

		if (!hasPngDir) await fs.promises.mkdir(pngDirPath)
		if (!hasWebpDir) await fs.promises.mkdir(webpDirPath)

		await _recursiveZipPng(dir, '', options.zipPngImageminOptions)
		await _recursiveFindPicDirAndCreate(
			'png',
			dir,
			relativeFilepathExistsMap,
			pngDirPath,
			options.toWebpSharpOptions,
			options.formatPngSharpOptions,
		)
		await _recursiveFindPicDirAndCreate(
			'webp',
			dir,
			relativeFilepathExistsMap,
			webpDirPath,
			options.toWebpSharpOptions,
			options.formatPngSharpOptions,
		)
	}
}

async function _recursiveZipPng(
	rootDirPath: string,
	dirPath: string,
	pngImageminOptions?: ImageminPngOptions,
) {
	try {
		const lstatList = await fs.promises.readdir(
			`${rootDirPath}${SL}${ZIP_PNG_DIR_NAME}${dirPath}`,
			{ withFileTypes: true },
		)

		for (let i = 0; i < lstatList.length; i++) {
			const lstat = lstatList[i]
			const filepath = `${dirPath}${SL}${lstat.name}`
			if (lstat.isDirectory()) {
				await _recursiveZipPng(rootDirPath, filepath)
			} else {
				await _zipPngFile(rootDirPath, filepath, pngImageminOptions)
			}
		}
	} catch {}
}

async function _zipPngFile(
	rootDirPath: string,
	relativeFilepath: string,
	pngImageminOptions?: ImageminPngOptions,
) {
	const zipFilepath = `${rootDirPath}${SL}${ZIP_PNG_DIR_NAME}${relativeFilepath}`
	const toFilepath = `${rootDirPath}${SL}png${relativeFilepath}`
	const imageminInputFilepath = zipFilepath.replace(/\\/g, '/')
	const imageminToDirPath = toFilepath.replace(/\\/g, '/').replace(/(\/)[^\/]+$/, '$1')

	await imagemin([imageminInputFilepath], {
		destination: imageminToDirPath,
		plugins: [imageminPngquant(pngImageminOptions)],
	})
	await fs.promises.rm(zipFilepath)
}

async function _recursiveFindPicDirAndCreate(
	ext: SupportExt,
	rootDirPath: string,
	relativeFilepathExistsMap: Record<string, 1>,
	dirPath: string,
	toWebpSharpOptions?: WebpOptions,
	formatPngSharpOptions?: PngOptions,
) {
	const lstatList = await fs.promises.readdir(dirPath, { withFileTypes: true })

	for (let i = 0; i < lstatList.length; i++) {
		const lstat = lstatList[i]
		const filepath = `${dirPath}${SL}${lstat.name}`
		const [, noExtFilename, fileExt] = (lstat.name.match(new RegExp(`(.+)\\.(.+)$`)) || []) as (
			| string
			| undefined
		)[]

		if (lstat.isDirectory()) {
			await _recursiveFindPicDirAndCreate(ext, rootDirPath, relativeFilepathExistsMap, filepath)
		} else if (fileExt != null && fileExt === ext) {
			const relativeFilepath = filepath.substring(rootDirPath.length)

			if (relativeFilepathExistsMap[relativeFilepath] == null) {
				relativeFilepathExistsMap[relativeFilepath] = 1
				await _checkCreateAnotherPic(
					ext,
					rootDirPath,
					dirPath,
					noExtFilename!,
					toWebpSharpOptions,
					formatPngSharpOptions,
				)
			}
		}
	}
}

function _getPathInfo(
	ext: SupportExt,
	rootDirPath: string,
	dirPath: string,
	noExtFilename: string,
) {
	const anotherExt = ext === 'png' ? 'webp' : 'png'
	const anotherDirPath = `${rootDirPath}${SL}${anotherExt}${dirPath.substring(
		rootDirPath.length + ext.length + 1,
	)}`
	const anotherFilepath = `${anotherDirPath}${SL}${noExtFilename}.${anotherExt}`
	const selfDirPath = `${rootDirPath}${SL}${ext}`
	const selfFilepath = `${dirPath}${SL}${noExtFilename}.${ext}`

	return {
		another: {
			ext: anotherExt,
			dirPath: anotherDirPath,
			filepath: anotherFilepath,
		},
		self: {
			ext,
			dirPath: selfDirPath,
			filepath: selfFilepath,
		},
	}
}

async function _checkCreateAnotherPic(
	ext: SupportExt,
	rootDirPath: string,
	dirPath: string,
	noExtFilename: string,
	toWebpSharpOptions?: WebpOptions,
	formatPngSharpOptions?: PngOptions,
) {
	const { another, self } = _getPathInfo(ext, rootDirPath, dirPath, noExtFilename)

	if (another.dirPath.length !== self.dirPath.length) {
		try {
			await fs.promises.access(another.dirPath)
		} catch {
			await fs.promises.mkdir(another.dirPath, { recursive: true })
		}
	}

	try {
		await fs.promises.access(another.filepath)
	} catch {
		if (ext === 'png') {
			await sharp(self.filepath).webp(toWebpSharpOptions).toFile(another.filepath)
		} else {
			await sharp(self.filepath).toFormat('png', formatPngSharpOptions).toFile(another.filepath)
		}
	}
}

function _getRootDirPath(options: CycleConvertPngAndWebpOptions, filepath: string) {
	if (!/\.(png|webp)$/.test(filepath)) return null

	for (let i = 0; i < options.dirs.length; i++) {
		const dir = options.dirs[i]
		const [s1, s2] = filepath.split(dir)
		if (s1 === '') {
			const [, dirName] = s2.match(new RegExp(`^\\${SL}(png|webp|${ZIP_PNG_DIR_NAME})`)) || []
			if (dirName != null) {
				return {
					dirPath: dir,
					dirName,
				}
			}
		}
	}

	return null
}

function _onUpdate(eventName: string, options: CycleConvertPngAndWebpOptions) {
	return async (filepath: string) => {
		const pathInfoParameters = _getPathInfoParameters(options, filepath)
		if (pathInfoParameters == null) return

		if (pathInfoParameters.dirName === ZIP_PNG_DIR_NAME) {
			await _zipPngFile(
				pathInfoParameters.rootDirPath,
				`${pathInfoParameters.fileDirPath.substring(pathInfoParameters.rootDirPath.length + SL.length + ZIP_PNG_DIR_NAME.length, pathInfoParameters.fileDirPath.length)}${SL}${pathInfoParameters.noExtFilename}.${pathInfoParameters.fileExt}`,
				options.zipPngImageminOptions,
			)
		} else {
			await _checkCreateAnotherPic(
				pathInfoParameters.fileExt,
				pathInfoParameters.rootDirPath,
				pathInfoParameters.fileDirPath,
				pathInfoParameters.noExtFilename,
				options.toWebpSharpOptions,
				options.formatPngSharpOptions,
			)
		}
	}
}

function _getPathInfoParameters(
	options: CycleConvertPngAndWebpOptions,
	filepath: string,
): GetPathInfoParametersReturn {
	const { dirPath: rootDirPath, dirName } = _getRootDirPath(options, filepath) || {}
	if (rootDirPath == null) return null

	const filename = filepath.match(/[\\\/]([^\\\/]+)$/)?.[1]!
	const [, noExtFilename, fileExt] = (filename.match(/(.+)\.(.+)$/) || []) as (
		| string
		| undefined
	)[]

	return {
		dirName: dirName as GetPathInfoParametersDirname,
		fileExt: fileExt as SupportExt,
		rootDirPath,
		fileDirPath: filepath.substring(0, filepath.length - filename.length - 1),
		noExtFilename: noExtFilename!,
	}
}

function cycleConvertPngAndWebp(options: CycleConvertPngAndWebpOptions): any {
	const plugin: Plugin = {
		name: FULL_PLUGIN_NAME,
		enforce: 'pre',
		async config() {
			await _convert(options)
			console.log(`[LOG]${CONSOLE_NAME} 已開啟 png ⇆ webp 圖片轉換功能...`)
		},
		async configureServer(server) {
			server.watcher.on('add', _onUpdate('add', options))
			server.watcher.on('change', _onUpdate('change', options))
			server.watcher.on('unlink', async filepath => {
				const pathInfoParameters = _getPathInfoParameters(options, filepath)
				if (pathInfoParameters == null || pathInfoParameters.dirName === ZIP_PNG_DIR_NAME)
					return

				const { another, self } = _getPathInfo(
					pathInfoParameters.fileExt,
					pathInfoParameters.rootDirPath,
					pathInfoParameters.fileDirPath,
					pathInfoParameters.noExtFilename,
				)

				try {
					await fs.promises.rm(another.filepath)
				} catch {}
			})
		},
	}

	return plugin
}

export type { CycleConvertPngAndWebpOptions }

export { cycleConvertPngAndWebp }
