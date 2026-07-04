import type {
  DashboardStats,
  StageAverage,
  RatingDistribution,
  ActivityItem,
  RecentSession,
} from '../../../shared/types/dashboard'

export const dashboardStats: DashboardStats = {
  totalPrograms: 5,
  activeSessions: 3,
  totalParticipants: 127,
  reportsSent: 89,
  reportsTotal: 127,
}

export const stageAverages: StageAverage[] = [
  { stageName: 'Sapa Profesi', averageRating: 4.2, totalAssessments: 45 },
  { stageName: 'Games Edukasi', averageRating: 3.8, totalAssessments: 42 },
  {
    stageName: 'Modern vs Tradisional',
    averageRating: 4.5,
    totalAssessments: 40,
  },
  { stageName: 'Refleksi', averageRating: 4.0, totalAssessments: 38 },
]

export const ratingDistribution: RatingDistribution[] = [
  {
    rating: 1,
    label: 'Belum terlihat',
    count: 5,
    percentage: 3.3,
    color: '#EF4444',
  },
  {
    rating: 2,
    label: 'Mulai berkembang',
    count: 12,
    percentage: 8.0,
    color: '#F97316',
  },
  {
    rating: 3,
    label: 'Cukup baik',
    count: 35,
    percentage: 23.3,
    color: '#EAB308',
  },
  {
    rating: 4,
    label: 'Sangat baik',
    count: 58,
    percentage: 38.7,
    color: '#22C55E',
  },
  {
    rating: 5,
    label: 'Luar biasa',
    count: 40,
    percentage: 26.7,
    color: '#3B82F6',
  },
]

export const recentActivities: ActivityItem[] = [
  {
    id: 'a-1',
    type: 'session_started',
    title: 'Sesi Dimulai',
    description: 'Kunjungan SD Matahari telah dimulai',
    timestamp: '2026-07-04T08:00:00+07:00',
    icon: 'Play',
    color: 'text-green-600 bg-green-100',
  },
  {
    id: 'a-2',
    type: 'participant_added',
    title: 'Peserta Ditambahkan',
    description: '15 peserta baru ditambahkan ke Kelompok Merah',
    timestamp: '2026-07-04T07:30:00+07:00',
    icon: 'Users',
    color: 'text-blue-600 bg-blue-100',
  },
  {
    id: 'a-3',
    type: 'report_sent',
    title: 'Raport Dikirim',
    description: '8 raport berhasil dikirim ke orang tua',
    timestamp: '2026-07-03T16:00:00+07:00',
    icon: 'FileText',
    color: 'text-purple-600 bg-purple-100',
  },
  {
    id: 'a-4',
    type: 'stage_completed',
    title: 'Stage Selesai',
    description: 'Kelompok Biru menyelesaikan Sapa Profesi',
    timestamp: '2026-07-04T09:15:00+07:00',
    icon: 'CheckCircle',
    color: 'text-emerald-600 bg-emerald-100',
  },
  {
    id: 'a-5',
    type: 'session_created',
    title: 'Sesi Baru Dibuat',
    description: 'Sesi "Edukasi Pertanian" dijadwalkan 5 Juli',
    timestamp: '2026-07-04T10:00:00+07:00',
    icon: 'Calendar',
    color: 'text-orange-600 bg-orange-100',
  },
]

export const recentSessions: RecentSession[] = [
  {
    id: 's-1',
    name: 'Kunjungan SD Matahari',
    programName: 'Belajar Bertani',
    date: '2026-07-04',
    status: 'ACTIVE',
    participantCount: 45,
    completionRate: 65,
  },
  {
    id: 's-2',
    name: 'Trip TK Ceria',
    programName: 'Mengenal Laut',
    date: '2026-07-03',
    status: 'COMPLETED',
    participantCount: 32,
    completionRate: 100,
  },
  {
    id: 's-3',
    name: 'Kelas Inspirasi SDN 5',
    programName: 'Petualangan Hutan',
    date: '2026-07-05',
    status: 'DRAFT',
    participantCount: 50,
    completionRate: 0,
  },
]

export const teamMembers = [
  { id: '1', name: 'Padhang Sanio', role: 'Koordinator', avatar: '' },
  { id: '2', name: 'Zain Horizontal', role: 'Fasilitator', avatar: '' },
  { id: '3', name: 'Leonardo Samsel', role: 'Fasilitator', avatar: '' },
]

export const weeklyActivity = [
  { week: '10-16 Jul', count: 15 },
  { week: '17-20 Jul', count: 28 },
  { week: '21-30 Jul', count: 42 },
]

export const sessionCards = [
  {
    id: 's-1',
    name: 'Kunjungan SD Matahari',
    programName: 'Belajar Bertani',
    status: 'ACTIVE',
    statusLabel: 'Aktif',
    image: 'bg-gradient-to-br from-primary to-primary-light',
    mentor: 'Padhang Sanio',
    mentorAvatar: '',
    isSaved: false,
  },
  {
    id: 's-2',
    name: 'Trip TK Ceria',
    programName: 'Mengenal Laut',
    status: 'COMPLETED',
    statusLabel: 'Selesai',
    image: 'bg-gradient-to-br from-secondary to-secondary-container',
    mentor: 'Zain Horizontal',
    mentorAvatar: '',
    isSaved: true,
  },
  {
    id: 's-3',
    name: 'Kelas Inspirasi SDN 5',
    programName: 'Petualangan Hutan',
    status: 'DRAFT',
    statusLabel: 'Draf',
    image: 'bg-gradient-to-br from-tertiary to-tertiary-container',
    mentor: 'Leonardo Samsel',
    mentorAvatar: '',
    isSaved: false,
  },
]
