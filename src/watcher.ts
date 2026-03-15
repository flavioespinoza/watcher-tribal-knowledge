import chokidar from 'chokidar'
import { rename, mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { preprocessImage } from './preprocess.js'
import { extractText } from './ocr.js'
import { analyzeText } from './analyze.js'
import { writeMarkdown, updateMasterReport } from './writer.js'
import { fireAlert } from './alert.js'

// Target directory — passed as CLI arg or falls back to cwd
const TARGET_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(process.cwd())
const IMAGES_DIR = path.join(TARGET_DIR, 'images')
const IMAGES_DONE_DIR = path.join(IMAGES_DIR, 'done')
const OUTPUT_DIR = TARGET_DIR
const MASTER_REPORT = path.join(TARGET_DIR, 'README__tribal-knowledge.md')

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

// Track files being processed to avoid double-processing
const processing = new Set<string>()

/**
 * Generates a standardized filename: tribal__screenshot--{YYYY-MM-DD}__{epoch}
 */
function generateStandardName(ext: string): string {
	const now = new Date()
	const yyyy = now.getFullYear()
	const mm = String(now.getMonth() + 1).padStart(2, '0')
	const dd = String(now.getDate()).padStart(2, '0')
	const epoch = now.getTime()
	return `tribal__screenshot--${yyyy}-${mm}-${dd}__${epoch}${ext}`
}

/**
 * Renames an incoming image to the standard FX naming pattern.
 * Returns the new path.
 */
async function renameImage(imagePath: string): Promise<string> {
	const ext = path.extname(imagePath).toLowerCase()
	const standardName = generateStandardName(ext)
	const newPath = path.join(path.dirname(imagePath), standardName)
	await rename(imagePath, newPath)
	console.log(`[watcher] Renamed: ${path.basename(imagePath)} → ${standardName}`)
	return newPath
}

/**
 * Process a single image through the full pipeline:
 * 0. Rename to standard FX naming
 * 1. Preprocess (compression if >10MB)
 * 2. OCR via Gemini Vision
 * 3. Analyze via Gemini 2.5 Flash
 * 4. Write structured markdown
 * 5. Drums + blocking popup + clipboard on dismiss
 */
async function processImage(imagePath: string): Promise<void> {
	const originalName = path.basename(imagePath)
	console.log(`\n[watcher] New image detected: ${originalName}`)
	console.log('[watcher] Starting pipeline...')

	let renamedPath = imagePath

	try {
		// Stage 0: Rename to standard naming
		console.log('[pipeline] Stage 0: Renaming image...')
		renamedPath = await renameImage(imagePath)
		// Block chokidar from treating the renamed file as a new image
		processing.add(renamedPath)

		// Stage 1: Preprocess
		console.log('[pipeline] Stage 1: Preprocessing image...')
		const processedPath = await preprocessImage(renamedPath)

		// Stage 2: OCR
		console.log('[pipeline] Stage 2: Extracting text via Gemini Vision...')
		const rawText = await extractText(processedPath)
		console.log(`[pipeline] Stage 2 complete: ${rawText.length} characters extracted`)

		// Stage 3: Analysis
		console.log('[pipeline] Stage 3: Analyzing via Gemini 2.5 Flash...')
		const analysis = await analyzeText(rawText)
		console.log(`[pipeline] Stage 3 complete: topic="${analysis.topic}"`)

		// Write markdown
		console.log('[pipeline] Writing markdown...')
		const { filePath, heading } = await writeMarkdown(analysis, renamedPath, OUTPUT_DIR)

		// Move processed image to done/
		await mkdir(IMAGES_DONE_DIR, { recursive: true })
		const donePath = path.join(IMAGES_DONE_DIR, path.basename(renamedPath))
		await rename(renamedPath, donePath)
		console.log(`[pipeline] Moved image to: ${donePath}`)

		// Update master report
		await updateMasterReport(OUTPUT_DIR, analysis, renamedPath, filePath)

		// Post-processing: drums + blocking popup + clipboard on dismiss
		fireAlert(filePath, heading)

		console.log(`[watcher] Pipeline complete: ${filePath}`)
	} catch (err) {
		console.error(`[watcher] Pipeline failed for ${originalName}:`, err)
	} finally {
		processing.delete(renamedPath)
	}
}

/**
 * Ensures the target directory structure exists.
 * Creates tribal-knowledge/, images/, images/done/, and README if missing.
 */
async function ensureTargetDir(): Promise<void> {
	await mkdir(IMAGES_DONE_DIR, { recursive: true })

	try {
		await access(MASTER_REPORT)
	} catch {
		const projectName = path.basename(path.dirname(TARGET_DIR))
		const readme = `# Tribal Knowledge -- ${projectName}

Undocumented tips, Slack screenshots, and platform-specific knowledge that isn't in any official doc.

## How This Works

1. Flavio drops a screenshot into \`tribal-knowledge/images/\` (any name, any format)
2. The watcher renames the image: \`tribal__screenshot--{YYYY-MM-DD}__{timestamp}.png\`
3. The watcher creates a matching \`.md\` file with a **VERBATIM** transcription
4. Processed image moves to \`images/done/\`
5. The \`.md\` file stays in \`tribal-knowledge/\` root
6. This README index gets updated with the new entry

## Naming Convention

\`\`\`txt
tribal__screenshot--{YYYY-MM-DD}__{timestamp}.png    # Original image (moves to images/done/)
tribal__screenshot--{YYYY-MM-DD}__{timestamp}.md     # Verbatim transcription (stays in root)
\`\`\`

## Index

_No entries yet. Drop a screenshot into \`images/\` to get started._
`
		await writeFile(MASTER_REPORT, readme, 'utf-8')
		console.log(`[watcher] Created: ${MASTER_REPORT}`)
	}
}

async function start(): Promise<void> {
	console.log('[watcher] Tribal Knowledge Chief starting...')
	console.log(`[watcher] Target:   ${TARGET_DIR}`)

	// Auto-create target directory structure if missing
	await ensureTargetDir()

	console.log(`[watcher] Watching: ${IMAGES_DIR}`)
	console.log(`[watcher] Output:   ${OUTPUT_DIR}`)

	const watcher = chokidar.watch(IMAGES_DIR, {
		ignoreInitial: true,
		ignored: [IMAGES_DONE_DIR, /(^|[/\\])\./],
		awaitWriteFinish: {
			stabilityThreshold: 1000,
			pollInterval: 200
		}
	})

	watcher.on('add', async (filePath: string) => {
		const ext = path.extname(filePath).toLowerCase()
		if (!SUPPORTED_EXTENSIONS.has(ext)) return

		// Skip files in done/
		if (filePath.includes(path.join('images', 'done'))) return

		// Skip if already processing
		if (processing.has(filePath)) return

		processing.add(filePath)
		try {
			await processImage(filePath)
		} finally {
			processing.delete(filePath)
		}
	})

	watcher.on('error', (err) => {
		console.error('[watcher] Error:', err)
	})

	console.log('[watcher] Ready. Waiting for screenshots...')
}

start()
