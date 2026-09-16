const { schemaToPromptText } = require('../../schemas/analysisSchema');

module.exports = {
  id: 'output_constraints',
  title: 'OUTPUT CONSTRAINTS & SCHEMA',
  build: () => `Output length constraints (very important — the answer must always fit completely within the token limit):
* At most 5 differential diagnoses. Include only the most relevant ones.
* At most 4 short items per list field (why_considered, supporting_findings, missing_or_uncertain_information, etc.).
* Use short phrases of 3-12 words per item; never full paragraphs.
* case_summary, clinical_pattern and uncertainty: at most 1-2 sentences each.
* important_missing_information: at most 5 items.
* comparison_with_other_candidates: at most 4 comparisons per diagnosis, each a single short sentence.
* contradiction_assessment.verdict: a single short sentence; severity must be exactly one of none | minor | significant.
* missing_information_impact: at most 5 items, each with a short title and a single short impact sentence.
* doctor_divergence_analysis: at most 4 disagreements, each reason a single short sentence; ranks are numbers or null.
* evidence_tree: at most 8 findings, 5 diagnosis nodes, and 6 links; conclusion and root_label in a single short sentence each; at most 4 confirmatory_clues per diagnosis node.
* second_opinion: at most 3 hypothesis_review items (only diagnoses from the physician's preliminary assessment) and at most 3 unconsidered_alternatives (only diagnoses NOT in the physician's list); 2-4 short findings per hypothesis; summary, recommendation and key_question each a single short sentence.
* Prefer concise, high-signal content over completeness. Truncated JSON is a failure.

Your answer must be valid JSON matching exactly this schema:

${schemaToPromptText()}

Return only JSON. Do not include markdown code fences, explanations, or text outside the JSON object.`,
};
