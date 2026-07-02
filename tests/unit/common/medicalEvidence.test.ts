import { buildMedicalEvidenceModePrompt } from '@/common/chat/medicalEvidence';
import { describe, expect, it } from 'vitest';

describe('Medical Evidence Mode prompt', () => {
  it('asks Codex runs to prefer GPT-IMAGE-2-style explanatory images', () => {
    const prompt = buildMedicalEvidenceModePrompt(['pmc'], true, 'en-US', 'codex');

    expect(prompt).toContain('Codex runtime image workflow');
    expect(prompt).toContain('GPT-IMAGE-2');
    expect(prompt).toContain('4K or highest-available-resolution image on a pure white background');
    expect(prompt).toContain('no information overload');
  });

  it('keeps non-Codex runs on the editable diagram workflow', () => {
    const prompt = buildMedicalEvidenceModePrompt(['pmc'], true, 'en-US', 'claude');

    expect(prompt).not.toContain('GPT-IMAGE-2');
    expect(prompt).toContain('Non-Codex runtime workflow');
    expect(prompt).toContain('Graphviz/Mermaid/draw.io-friendly diagrams');
  });
});
