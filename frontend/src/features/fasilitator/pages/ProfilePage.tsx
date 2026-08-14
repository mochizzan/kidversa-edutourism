import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User,
  Mail,
  Phone,
  Shield,
  LogOut,
  LayoutDashboard,
  Users,
  Camera,
  ChevronRight,
  Pencil,
  Smartphone,
  Layers,
} from 'lucide-react'
import { Card } from '../../../shared/components/ui/Card'
import { ROUTES } from '../../../core/constants/app'
import { Button } from '../../../shared/components/ui/Button'
import { useFacilitatorProfile } from '../hooks/useFacilitatorProfile'
import EditNameModal from '../components/EditNameModal'
import EditEmailModal from '../components/EditEmailModal'
import EditPhoneModal from '../components/EditPhoneModal'
import type { User as UserType } from '../../../core/types'
import { AvatarUploadModal } from '../../../shared/components/ui/AvatarUploadModal'
import { Tooltip } from '../../../shared/components/ui/Tooltip'
import { cn } from '../../../core/utils'
import { getMediaUrl } from '../../../core/utils/media'

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  KOORDINATOR: 'Koordinator',
  FASILITATOR: 'Fasilitator',
}

const ProfilePage = () => {
  const navigate = useNavigate()
  const { user, handleLogout, handleAvatarUpload } = useFacilitatorProfile()
  const [editField, setEditField] = useState<'name' | 'email' | 'phone' | null>(null)
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [pendingDragFile, setPendingDragFile] = useState<File | null>(null)
  const [avatarDragOver, setAvatarDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  const handleAvatarDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current++
    setAvatarDragOver(true)
  }

  const handleAvatarDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setAvatarDragOver(false)
  }

  const handleAvatarDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
  }

  const handleAvatarDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current = 0
    setAvatarDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      setPendingDragFile(file)
      setShowAvatarModal(true)
    }
  }

  if (!user) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <div className='bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.05)] p-8 max-w-sm w-full text-center'>
          <div className='w-14 h-14 rounded-2xl bg-[#F1EAFE] flex items-center justify-center mx-auto mb-4'>
            <User className='w-7 h-7 text-[#6D28D9]' />
          </div>
          <h3 className='text-lg font-bold text-slate-900'>Tidak dapat memuat profil</h3>
          <p className='text-sm text-slate-500 mt-1.5'>Silakan login ulang ke dalam sistem.</p>
          <Button
            variant='primary'
            className='mt-6 w-full bg-[#6D28D9] hover:bg-[#5B21B6] text-white'
            onClick={handleLogout}
          >
            Login Ulang
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className='space-y-6 md:space-y-7 lg:space-y-8 max-w-4xl mx-auto pb-6 md:pb-8 lg:pb-12'>
      {/* ── Page Title ── */}
      <div className='space-y-1 mb-6 md:mb-7 lg:mb-8'>
        <h2 className='text-[28px] md:text-[32px] lg:text-[36px] font-bold text-slate-900 leading-tight'>
          Profil
        </h2>
        <p className='text-[13px] md:text-[14px] lg:text-[16px] text-slate-500 font-normal'>
          Kelola informasi akun dan preferensi aplikasi Anda.
        </p>
      </div>

      {/* ── Hero Card ── */}
      <Card
        padding='none'
        className='p-6 md:p-7 lg:p-8 border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.05)] rounded-[20px]'
      >
        <div className='flex flex-col md:flex-row items-center md:items-start gap-5 md:gap-6 lg:gap-8'>
          <div
            className='relative shrink-0'
            onDragEnter={handleAvatarDragEnter}
            onDragLeave={handleAvatarDragLeave}
            onDragOver={handleAvatarDragOver}
            onDrop={handleAvatarDrop}
          >
            <div className={cn(
              'w-[96px] h-[96px] md:w-[108px] md:h-[108px] lg:w-[120px] lg:h-[120px] rounded-full bg-[#F1EAFE] border-2 border-white shadow-sm flex items-center justify-center overflow-hidden transition-all duration-200',
              avatarDragOver && 'ring-2 ring-primary'
            )}>
              {user.avatar_url ? (
                <img src={getMediaUrl('avatar', user.id)} alt={user.name} className='w-full h-full object-cover rounded-full' />
              ) : (
                <span className='text-[36px] md:text-[42px] lg:text-[48px] font-bold text-[#6D28D9]'>
                  {user.name?.charAt(0)?.toUpperCase() || '?'}
                </span>
              )}
            </div>
            <Tooltip content='Ubah foto profil'>
              <button
                type='button'
                aria-label='Ubah foto profil'
                onClick={() => { setPendingDragFile(null); setShowAvatarModal(true) }}
                className='absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#6D28D9] border-[3px] border-white flex items-center justify-center text-white shadow-md hover:bg-[#5B21B6] transition-all hover:scale-105 active:scale-95'
              >
                <Camera className='w-4 h-4' />
              </button>
            </Tooltip>
          </div>

          <div className='flex-1 text-center md:text-left'>
            <div className='flex items-center justify-center md:justify-start gap-2'>
              <h3 className='text-[22px] md:text-[28px] lg:text-[32px] font-bold text-slate-900 leading-none'>
                {user.name}
              </h3>
              <button
                type='button'
                aria-label='Edit nama'
                onClick={() => setEditField('name')}
                className='shrink-0 w-7 h-7 rounded-lg bg-[#F1EAFE] text-[#6D28D9] hover:bg-[#E9D8FD] active:scale-95 transition-all flex items-center justify-center'
              >
                <Pencil className='w-3.5 h-3.5' />
              </button>
            </div>
            <p className='text-[13px] md:text-[15px] lg:text-[18px] text-slate-500 font-normal mt-2 md:mt-2.5'>
              {roleLabel[user.role] || user.role}
            </p>

            <div className='flex flex-wrap items-center justify-center md:justify-start gap-2 mt-3 md:mt-4'>
              <span className='inline-flex items-center gap-1.5 px-3 md:px-4 h-9 md:h-10 rounded-[12px] border border-[#E8E8E8] bg-[#F8F9FB] text-[11px] md:text-[12px] font-semibold text-slate-600'>
                <User className='w-3.5 h-3.5' />
                <span className='text-slate-400'>ID Akun:</span>
                <span className='font-bold text-[#6D28D9]'>{user.id}</span>
              </span>
              <span className='inline-flex items-center gap-1.5 px-3 md:px-4 h-9 md:h-10 rounded-[12px] border border-[#E8E8E8] bg-[#F8F9FB] text-[11px] md:text-[12px] font-semibold text-slate-600'>
                <Shield className='w-3.5 h-3.5' />
                {roleLabel[user.role] || user.role}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Informasi Akun ── */}
      <div className='space-y-3'>
        <div className='flex items-center gap-2.5 px-1 mb-3'>
          <div className='w-9 h-9 rounded-xl bg-[#F1EAFE] flex items-center justify-center'>
            <User className='w-4 h-4 text-[#6D28D9]' />
          </div>
          <div>
            <h4 className='text-sm md:text-[15px] font-bold text-slate-900 leading-none'>Informasi Akun</h4>
            <p className='text-[11px] md:text-xs text-slate-500 mt-0.5'>Detail akun yang terdaftar pada sistem.</p>
          </div>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4'>
          <InfoItem
            icon={Mail}
            label='Email'
            value={user.email}
            onEdit={() => setEditField('email')}
          />
          <InfoItem
            icon={Phone}
            label='Telepon'
            value={user.phone || '-'}
            onEdit={() => setEditField('phone')}
          />
          <InfoItem icon={Shield} label='Role' value={roleLabel[user.role] || user.role} />
          <InfoItem icon={User} label='ID Akun' value={user.id} />
        </div>
      </div>

      {/* ── Aplikasi ── */}
      <div className='space-y-3'>
        <div className='flex items-center gap-2.5 px-1 mb-3'>
          <div className='w-9 h-9 rounded-xl bg-[#F1EAFE] flex items-center justify-center'>
            <Smartphone className='w-4 h-4 text-[#6D28D9]' />
          </div>
          <div>
            <h4 className='text-sm md:text-[15px] font-bold text-slate-900 leading-none'>Aplikasi</h4>
            <p className='text-[11px] md:text-xs text-slate-500 mt-0.5'>Informasi aplikasi yang Anda gunakan.</p>
          </div>
        </div>
        <Card
          padding='none'
          className='p-5 md:p-6 border border-[#ECECEC] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.04)] rounded-[18px]'
        >
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-100'>
            <div className='flex items-center justify-between pr-0 md:pr-4 py-2 md:py-0'>
              <span className='text-sm font-semibold text-slate-500'>Versi</span>
              <span className='text-sm font-bold text-slate-800'>1.0.0</span>
            </div>
            <div className='flex items-center justify-between pl-0 md:pl-4 pt-3 md:pt-0 pb-2 md:pb-0'>
              <span className='text-sm font-semibold text-slate-500'>Mode</span>
              {import.meta.env.VITE_DEMO_MODE === 'true' && (
                <span className='inline-flex px-3 py-1 rounded-full bg-[#F4EBFF] text-[#6D28D9] text-[11px] font-bold border border-purple-100'>
                  Demo
                </span>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ── Menu Cepat ── */}
      <div className='space-y-3'>
        <div className='flex items-center gap-2.5 px-1 mb-3'>
          <div className='w-9 h-9 rounded-xl bg-[#F1EAFE] flex items-center justify-center'>
            <Layers className='w-4 h-4 text-[#6D28D9]' />
          </div>
          <div>
            <h4 className='text-sm md:text-[15px] font-bold text-slate-900 leading-none'>Menu Cepat</h4>
            <p className='text-[11px] md:text-xs text-slate-500 mt-0.5'>Akses cepat ke fitur yang sering digunakan.</p>
          </div>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4'>
          <QuickMenuItem
            icon={LayoutDashboard}
            title='Dashboard'
            desc='Lihat ringkasan aktivitas'
            onClick={() => navigate(ROUTES.FASILITATOR.DASHBOARD)}
          />
          <QuickMenuItem
            icon={Users}
            title='Kelompok'
            desc='Kelola semua kelompok'
            onClick={() => navigate(ROUTES.FASILITATOR.GROUPS)}
          />
          <QuickMenuItem
            icon={Camera}
            title='Kamera'
            desc='Buka kamera untuk scan QR'
            onClick={() => navigate(ROUTES.FASILITATOR.CAMERA)}
          />
        </div>
      </div>

      {/* ── Logout ── */}
      <button
        type='button'
        onClick={handleLogout}
        className='w-full h-12 md:h-14 lg:h-[72px] flex items-center justify-between px-5 md:px-6 rounded-[16px] bg-[#FFF9F9] hover:bg-[#FFF0F0] border border-[#F4BABA] shadow-[0_2px_6px_rgba(0,0,0,0.04)] active:scale-[0.99] transition-all group'
      >
        <div className='flex items-center gap-3'>
          <div className='w-10 h-10 rounded-[12px] bg-[#FCE7E7] flex items-center justify-center shrink-0'>
            <LogOut className='w-5 h-5 text-[#DC2626]' />
          </div>
          <div className='text-left'>
            <p className='text-sm md:text-[15px] font-bold text-[#DC2626]'>Keluar Akun</p>
            <p className='text-[11px] md:text-xs text-[#DC2626]/60'>Keluar dari akun saat ini</p>
          </div>
        </div>
        <ChevronRight className='w-5 h-5 text-[#DC2626]/50 group-hover:text-[#DC2626] group-hover:translate-x-1 transition-all shrink-0' />
      </button>

      {/* ── Avatar Upload Modal ── */}
      <AvatarUploadModal
        open={showAvatarModal}
        onClose={() => { setShowAvatarModal(false); setPendingDragFile(null) }}
        currentAvatarUrl={getMediaUrl('avatar', user.id)}
        initialFile={pendingDragFile}
        onUpload={handleAvatarUpload}
      />

      {/* ── Edit Modals ── */}
      <EditNameModal
        open={editField === 'name'}
        onClose={() => setEditField(null)}
        user={user as UserType}
      />
      <EditEmailModal
        open={editField === 'email'}
        onClose={() => setEditField(null)}
        user={user as UserType}
      />
      <EditPhoneModal
        open={editField === 'phone'}
        onClose={() => setEditField(null)}
        user={user as UserType}
      />
    </div>
  )
}

const InfoItem = ({
  icon: Icon,
  label,
  value,
  onEdit,
}: {
  icon: any
  label: string
  value: any
  onEdit?: () => void
}) => (
  <div
    className={cn(
      'bg-white border border-[#ECECEC] rounded-[14px] p-4 flex items-center gap-3 md:gap-4 shadow-[0_2px_6px_rgba(0,0,0,0.04)]',
      onEdit && 'pr-3 md:pr-4'
    )}
  >
    <div className='w-10 h-10 rounded-[12px] bg-[#F1EAFE] flex items-center justify-center shrink-0'>
      <Icon className='w-5 h-5 text-[#6D28D9]' />
    </div>
    <div className='flex-1 min-w-0'>
      <p className='text-[10px] md:text-[11px] text-slate-400 font-semibold uppercase tracking-wider'>{label}</p>
      <div className='text-sm md:text-[15px] font-bold text-slate-800 truncate mt-0.5'>{value}</div>
    </div>
    {onEdit && (
      <button
        type='button'
        aria-label={`Edit ${label}`}
        onClick={onEdit}
        className='shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-[10px] bg-[#F1EAFE] text-[#6D28D9] hover:bg-[#E9D8FD] active:scale-95 transition-all flex items-center justify-center'
      >
        <Pencil className='w-4 h-4' />
      </button>
    )}
  </div>
)

const QuickMenuItem = ({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: any
  title: string
  desc: string
  onClick: () => void
}) => (
  <button
    type='button'
    onClick={onClick}
    className='bg-white border border-[#ECECEC] rounded-[14px] p-4 shadow-[0_2px_6px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)] hover:border-[#E5E5E5] transition-all group active:scale-[0.98] text-left flex items-center justify-between'
  >
    <div className='flex items-center gap-3 md:gap-4 min-w-0 flex-1'>
      <div className='w-10 h-10 md:w-11 md:h-11 rounded-[12px] bg-[#F1EAFE] flex items-center justify-center shrink-0'>
        <Icon className='w-5 h-5 text-[#6D28D9]' />
      </div>
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-bold text-slate-800 truncate'>{title}</p>
        <p className='text-[11px] md:text-xs text-slate-400 mt-0.5 truncate'>{desc}</p>
      </div>
    </div>
    <ChevronRight className='w-5 h-5 text-slate-300 group-hover:text-[#6D28D9] group-hover:translate-x-1 transition-all ml-2 shrink-0' />
  </button>
)

export default ProfilePage
