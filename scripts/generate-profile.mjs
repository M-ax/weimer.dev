import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourcePath = resolve(projectRoot, 'dev.md');
const destinationPath = resolve(projectRoot, 'src', 'lib', 'profile.generated.ts');
const apiKey = process.env.OPENAI_API_KEY;
const apiBaseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';

if (!apiKey) {
  throw new Error('Set OPENAI_API_KEY before running the profile generator.');
}

const source = await readFile(sourcePath, 'utf8');
const response = await fetch(`${apiBaseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    temperature: 0.35,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You transform a developer profile into concise web copy. Return valid JSON only with exactly these fields: name, role, availability, introduction, mission, capabilities, perspective, contact. capabilities must be an array of exactly three objects with title, description, and technologies (an array of 2-5 short strings). Preserve factual claims from the source; do not invent employers, links, credentials, or years of experience.',
      },
      { role: 'user', content: source },
    ],
  }),
});

if (!response.ok) {
  throw new Error(`Profile generation failed: ${response.status} ${await response.text()}`);
}

const payload = await response.json();
const content = payload.choices?.[0]?.message?.content;

if (typeof content !== 'string') {
  throw new Error('The AI response did not include profile content.');
}

let profile;
try {
  profile = JSON.parse(content);
} catch {
  throw new Error('The AI response was not valid JSON.');
}

const requiredStrings = ['name', 'role', 'availability', 'introduction', 'mission', 'perspective', 'contact'];
if (
  !requiredStrings.every((key) => typeof profile[key] === 'string' && profile[key].trim()) ||
  !Array.isArray(profile.capabilities) ||
  profile.capabilities.length !== 3 ||
  !profile.capabilities.every(
    (capability) =>
      typeof capability?.title === 'string' &&
      typeof capability?.description === 'string' &&
      Array.isArray(capability?.technologies) &&
      capability.technologies.every((technology) => typeof technology === 'string'),
  )
) {
  throw new Error('The AI response did not match the required profile shape.');
}

const output = `import type { DeveloperProfile } from './profile-types';\n\nexport const profile: DeveloperProfile = ${JSON.stringify(profile, null, 2)};\n`;
await writeFile(destinationPath, output, 'utf8');
console.log(`Generated ${destinationPath} from dev.md using ${model}.`);