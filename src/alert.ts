import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ALERT_SCRIPT = path.join(__dirname, '..', 'scripts', 'alert.sh')

/**
 * Post-processing alert — delegates to alert.sh (bash).
 * Bash handles afplay loop + osascript popup + clipboard reliably.
 * Node's execSync spawns a proper shell context where both work together.
 */
export function fireAlert(mdFilePath: string, heading: string): void {
	const filename = path.basename(mdFilePath)
	const clipboardMessage = `New tribal knowledge has been added at ${mdFilePath} -- Discuss with Flavio where it needs to be applied and whether it should be added to your local .claude/CLAUDE.md.`

	console.log('[alert] Firing alert...')
	try {
		execFileSync('bash', [ALERT_SCRIPT, filename, clipboardMessage], {
			stdio: 'inherit'
		})
		console.log('[alert] Alert dismissed')
	} catch (err) {
		console.error('[alert] Alert failed:', err)
	}
}
