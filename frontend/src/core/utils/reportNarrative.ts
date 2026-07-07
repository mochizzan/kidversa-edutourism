import type { Assessment } from '../types/entities'

export interface NarrativeParams {
  childName: string
  assessments: Assessment[]
  stageNames: Map<string, string>
  facilitatorComments?: string
}

export function generateReportNarrative({
  childName,
  assessments,
  stageNames,
  facilitatorComments,
}: NarrativeParams): string {
  if (assessments.length === 0) {
    return `${childName} telah mengikuti program edutourism dengan penuh semangat. Kami berharap pengalaman ini memberikan kenangan indah dan pembelajaran yang bermakna.`
  }

  // Calculate average rating
  const ratings = assessments.filter((a) => a.star_rating != null).map((a) => a.star_rating!)
  const avgRating = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0

  // Find best and lowest rated stages
  const stageRatings = new Map<string, number[]>()
  assessments.forEach((assessment) => {
    if (!assessment.session_stage_id || assessment.star_rating == null) return
    if (!stageRatings.has(assessment.session_stage_id)) {
      stageRatings.set(assessment.session_stage_id, [])
    }
    stageRatings.get(assessment.session_stage_id)!.push(assessment.star_rating)
  })

  const stageAvgs = Array.from(stageRatings.entries()).map(([stageId, ratings]) => ({
    stageId,
    avg: ratings.reduce((sum, r) => sum + r, 0) / ratings.length,
  }))

  stageAvgs.sort((a, b) => b.avg - a.avg)

  const bestStage = stageAvgs[0]
  const lowestStage = stageAvgs[stageAvgs.length - 1]

  // Build narrative
  let narrative = `${childName} telah menunjukkan partisipasi yang `

  if (avgRating >= 4.5) {
    narrative += 'luar biasa'
  } else if (avgRating >= 3.5) {
    narrative += 'sangat baik'
  } else if (avgRating >= 2.5) {
    narrative += 'baik'
  } else {
    narrative += 'positif'
  }

  narrative += ' selama mengikuti program edutourism. '

  // Mention best stage
  if (bestStage && bestStage.avg >= 4) {
    const stageName = stageNames.get(bestStage.stageId) || 'salah satu tahap'
    narrative += `${childName} sangat menonjol dalam aktivitas "${stageName}", menunjukkan antusiasme dan pemahaman yang mendalam. `
  }

  // Constructive note about growth area
  if (lowestStage && bestStage && lowestStage.stageId !== bestStage.stageId && lowestStage.avg < 4) {
    const stageName = stageNames.get(lowestStage.stageId) || 'beberapa tahap'
    narrative += `Untuk aktivitas "${stageName}", ${childName} masih memiliki ruang untuk terus berkembang dan mengeksplorasi lebih dalam. `
  }

  // Add facilitator comments if available
  if (facilitatorComments && facilitatorComments.trim()) {
    narrative += `\n\nCatatan Fasilitator: ${facilitatorComments.trim()}`
  }

  // Closing
  narrative += `\n\nKami berharap pengalaman ini memberikan pembelajaran yang bermakna dan menginspirasi ${childName} untuk terus belajar dengan penuh semangat.`

  return narrative
}
