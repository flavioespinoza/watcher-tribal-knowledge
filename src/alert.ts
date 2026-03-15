import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import os from 'node:os'

const execFileAsync = promisify(execFile)

const DRUMS_PATH = path.join(
	os.homedir(),
	'.claude',
	'alerts',
	'sounds',
	'indian-drums.m4a'
)

/**
 * Kill any orphaned osascript/afplay audio processes from previous runs.
 * When a VS Code terminal is trashed, Node dies but audio processes can survive as orphans.
 */
function killOrphanedAudio(): void {
	for (const proc of ['afplay', 'osascript']) {
		try {
			execFileSync('killall', [proc], { stdio: 'ignore' })
		} catch {
			// Not running — expected
		}
	}
}

/**
 * Plays indian drums audio via NSSound (non-blocking).
 * Uses osascript + AppKit's NSSound instead of afplay because afplay depends on
 * the terminal's audio session context — when a VS Code terminal is trashed and
 * restarted, afplay silently fails. NSSound talks directly to CoreAudio and has
 * no terminal session dependency.
 *
 * Returns the osascript child process so it can be killed when the popup is dismissed.
 */
function playDrums(): ChildProcess {
	killOrphanedAudio()
	const child = spawn('osascript', [
		'-e', 'use framework "AppKit"',
		'-e', 'use scripting additions',
		'-e', `set theSound to current application's NSSound's alloc's initWithContentsOfFile:"${DRUMS_PATH}" byReference:true`,
		'-e', 'theSound\'s play',
		'-e', 'delay 999'
	], { stdio: 'ignore' })
	child.on('error', (err) => console.error('[alert] osascript spawn error:', err))
	child.on('exit', (code) => {
		if (code !== null && code !== 0) {
			console.error(`[alert] osascript exited with code ${code}`)
		}
	})
	console.log('[alert] Playing drums audio (NSSound)')
	return child
}

/**
 * Shows a BLOCKING native macOS popup via osascript.
 * The popup stays on screen until Flavio clicks OK.
 * Returns when the popup is dismissed.
 */
async function showPopup(filename: string): Promise<void> {
	const script = `display alert "Tribal Knowledge" message "New tribal knowledge processed:\\n\\n${filename}" buttons {"OK"} default button "OK"`
	await execFileAsync('osascript', ['-e', script])
	console.log('[alert] Popup dismissed')
}

/**
 * Copies a message to the system clipboard via pbcopy.
 *
 * pbcopy with LANG/LC_CTYPE set performs encoding conversion (UTF-8 → Mac Roman),
 * which mangles multi-byte characters like … (U+2026) into the Mac Roman byte C9.
 * Stripping locale vars from pbcopy's env prevents that conversion — pbcopy then
 * treats stdin as raw bytes and the UTF-8 passes through intact.
 */
async function copyToClipboard(message: string): Promise<void> {
	const env = { ...process.env }
	delete env.LANG
	delete env.LC_ALL
	delete env.LC_CTYPE
	const child = execFileAsync('pbcopy', [], { env })
	child.child.stdin?.write(message, 'utf-8')
	child.child.stdin?.end()
	await child
	console.log(`[alert] Copied to clipboard: ${message}`)
}

/**
 * Post-processing alert: drums + blocking popup + clipboard on dismiss.
 *
 * Flow:
 * 1. Play indian drums audio (non-blocking)
 * 2. Show native macOS alert (BLOCKING — waits for OK)
 * 3. After OK is clicked, kill drums + copy message to clipboard
 */
export async function fireAlert(
	mdFilePath: string,
	heading: string
): Promise<void> {
	const filename = path.basename(mdFilePath)
	const clipboardMessage = `New tribal knowledge: ${mdFilePath} -- ## ${heading}`

	let drumsProcess: ChildProcess | null = null

	try {
		// Play drums alongside the popup
		drumsProcess = playDrums()

		// Blocking popup — waits until Flavio clicks OK
		await showPopup(filename)

		// Kill drums immediately on dismiss
		drumsProcess.kill()
		console.log('[alert] Drums stopped')

		// After dismiss — copy to clipboard
		await copyToClipboard(clipboardMessage)
	} catch (err) {
		drumsProcess?.kill()
		console.error('[alert] Alert failed:', err)
	}
}
