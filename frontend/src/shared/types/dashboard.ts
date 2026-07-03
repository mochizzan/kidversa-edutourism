export interface DashboardStats {
  totalPrograms: number
  activeSessions: number
  totalParticipants: number
  reportsSent: number
  reportsTotal: number
}

export interface StageAverage {
  stageName: string
  averageRating: number
  totalAssessments: number
}

export interface RatingDistribution {
  rating: number
  label: string
  count: number
  percentage: number
  color: string
}

export interface ActivityItem {
  id: string
  type:
    | 'session_created'
    | 'session_started'
    | 'session_completed'
    | 'report_sent'
    | 'participant_added'
    | 'stage_completed'
  title: string
  description: string
  timestamp: string
  icon: string
  color: string
}

export interface RecentSession {
  id: string
  name: string
  programName: string
  date: string
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  participantCount: number
  completionRate: number
}
