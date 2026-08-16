import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "../../../core/constants/app";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "../../../shared/components/ui/Button";
import { PageHeader } from "../../../shared/components/ui/PageHeader";
import { useGlobalToast } from "../../../shared/components/feedback/Toast";
import { contentService } from "../../../core/services";
import type { Content } from "../../../core/types";
import {
  StageContentForm,
  type StageContentFormValues,
} from "../../../features/admin/components/StageContentForm";

const ContentFormPage = () => {
  const navigate = useNavigate();
  const { contentId } = useParams();
  const isEdit = Boolean(contentId);
  const { addToast } = useGlobalToast();

  const [loading, setLoading] = useState(isEdit);
  const [content, setContent] = useState<Content | null>(null);

  useEffect(() => {
    if (!isEdit || !contentId) return;
    let cancelled = false;
    setLoading(true);
    contentService
      .getById(contentId)
      .then((c) => {
        if (cancelled) return;
        if (!c) {
          addToast({ type: "error", message: "Konten tidak ditemukan" });
          navigate(ROUTES.ADMIN.CONTENT);
          return;
        }
        setContent(c);
      })
      .catch(() => {
        if (!cancelled)
          addToast({ type: "error", message: "Gagal memuat konten" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, contentId, addToast, navigate]);

  const handleSubmit = async (values: StageContentFormValues, file: File | null) => {
    const youtube = values.youtube_url?.trim() || undefined;

    try {
      if (isEdit && contentId) {
        // A new file keeps the same Content ID (stage assignments intact).
        if (file) {
          await contentService.replaceFile(contentId, {
            file,
            title: values.title.trim(),
            file_type: values.file_type,
            duration_seconds: values.duration_seconds,
          });
        } else {
          await contentService.update(contentId, {
            title: values.title.trim(),
            file_url: values.file_url.trim(),
            youtube_url: youtube,
            file_type: values.file_type,
            duration_seconds: values.duration_seconds,
          });
        }
        addToast({ type: "success", message: "Konten berhasil diperbarui" });
      } else if (file) {
        await contentService.upload({
          file,
          title: values.title.trim(),
          file_type: values.file_type,
          duration_seconds: values.duration_seconds,
          youtube_url: youtube,
        });
        addToast({ type: "success", message: "Konten baru berhasil ditambahkan" });
      } else {
        await contentService.create({
          title: values.title.trim(),
          file_url: values.file_url.trim(),
          youtube_url: youtube,
          file_type: values.file_type,
          duration_seconds: values.duration_seconds,
        });
        addToast({ type: "success", message: "Konten baru berhasil ditambahkan" });
      }
      navigate(ROUTES.ADMIN.CONTENT);
    } catch {
      addToast({ type: "error", message: "Gagal menyimpan konten" });
    } finally {
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? "Edit Konten" : "Tambah Konten Baru"}
        subtitle={
          isEdit
            ? "Perbarui detail konten"
            : "Buat konten baru untuk perpustakaan tenant"
        }
        breadcrumbs={[
          { label: "Content Manager", href: ROUTES.ADMIN.CONTENT },
          { label: isEdit ? "Edit" : "Tambah" },
        ]}
        actions={
          <Button
            variant="secondary"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate(ROUTES.ADMIN.CONTENT)}
          >
            Kembali
          </Button>
        }
      />

      <StageContentForm
        initial={isEdit ? content : null}
        showActive={false}
        onSubmit={handleSubmit}
        onCancel={() => navigate(ROUTES.ADMIN.CONTENT)}
      />
    </div>
  );
};

export default ContentFormPage;
