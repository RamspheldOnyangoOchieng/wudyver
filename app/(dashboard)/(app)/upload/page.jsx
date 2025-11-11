"use client";

import SimpleBar from "simplebar-react";
import { useState, useCallback, useEffect, useRef } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Fileinput from "@/components/ui/Fileinput";
import { ToastContainer, toast } from "react-toastify";
import { Icon } from '@iconify/react';
import axios from 'axios';

// === Konfigurasi ===
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const SUPPORTED_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|wav|pdf|zip|rar|txt|doc|docx)$/i;
const ALLOWED_TYPES = [
  'image/', 'video/', 'audio/', 'application/pdf',
  'text/', 'application/zip', 'application/x-rar-compressed'
];

const UploaderPage = () => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hostLoading, setHostLoading] = useState(true);
  const [selectedHost, setSelectedHost] = useState('');
  const [availableHosts, setAvailableHosts] = useState([]);
  const [uploadResults, setUploadResults] = useState([]);
  const [showJsonResponse, setShowJsonResponse] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});

  // Ref untuk kontrol abort & lifecycle
  const cancelTokens = useRef(new Map());
  const isMounted = useRef(true);

  // Cleanup saat komponen di-unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      cancelTokens.current.forEach(token => token.cancel('Komponen dibongkar'));
      cancelTokens.current.clear();
    };
  }, []);

  // === Ambil daftar host ===
  useEffect(() => {
    const fetchHosts = async () => {
      setHostLoading(true);
      try {
        const response = await axios.get('/api/tools/upload');
        const hosts = response.data.hosts || [];
        if (isMounted.current) {
          setAvailableHosts(hosts);
          if (hosts.length > 0) {
            setSelectedHost(hosts[0]);
          }
        }
      } catch (error) {
        if (axios.isCancel(error)) return;
        console.error('Gagal mengambil host:', error);
        toast.error('Gagal memuat host. Coba refresh halaman.');
      } finally {
        if (isMounted.current) setHostLoading(false);
      }
    };
    fetchHosts();
  }, []);

  // === Validasi file ===
  const validateFile = (file) => {
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `Ukuran maksimal 100MB. File: ${file.name}` };
    }
    if (!SUPPORTED_EXTENSIONS.test(file.name)) {
      return { valid: false, error: `Format tidak didukung: ${file.name}` };
    }
    const typePrefix = file.type.split('/')[0] + '/';
    if (!ALLOWED_TYPES.some(type => file.type.startsWith(type))) {
      return { valid: false, error: `Tipe file tidak diizinkan: ${file.type}` };
    }
    return { valid: true };
  };

  // === Handler pilih file ===
  const handleFileChange = useCallback((e) => {
    const newFiles = Array.from(e.target.files || []);
    if (newFiles.length === 0) return;

    const existingKeys = new Set(
      selectedFiles.map(f => `${f.name}-${f.size}-${f.lastModified}`)
    );
    const validNewFiles = [];
    const errors = [];

    newFiles.forEach(file => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (existingKeys.has(key)) return;

      const validation = validateFile(file);
      if (!validation.valid) {
        errors.push(validation.error);
        return;
      }

      validNewFiles.push(file);
      existingKeys.add(key);
    });

    if (validNewFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validNewFiles]);
      toast.success(`${validNewFiles.length} file ditambahkan!`);
    }

    errors.forEach(err => toast.warn(err));

    if (validNewFiles.length === 0 && errors.length === 0) {
      toast.info("Tidak ada file baru yang valid.");
    }

    e.target.value = '';
  }, [selectedFiles]);

  // === Hapus file ===
  const removeFile = useCallback((index) => {
    const file = selectedFiles[index];
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setUploadProgress(prev => {
      const { [file.name]: _, ...rest } = prev;
      return rest;
    });
    toast.info(`${file.name} dihapus`);
  }, [selectedFiles]);

  // === Bersihkan semua ===
  const clearFiles = () => {
    setSelectedFiles([]);
    setUploadResults([]);
    setUploadProgress({});
    cancelTokens.current.forEach(token => token.cancel('Dibatalkan pengguna'));
    cancelTokens.current.clear();
    toast.info("Daftar dibersihkan");
  };

  // === Upload file ===
  const handleUpload = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      toast.warn("Pilih file dulu!");
      return;
    }

    setLoading(true);
    setUploadResults([]);
    setUploadProgress({});

    const results = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      if (!isMounted.current) break;

      const file = selectedFiles[i];
      const fileKey = `${file.name}-${file.size}-${file.lastModified}`;

      // Inisialisasi progress
      setUploadProgress(prev => ({
        ...prev,
        [fileKey]: { status: 'mengunggah', progress: 0 }
      }));

      const source = axios.CancelToken.source();
      cancelTokens.current.set(fileKey, source);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await axios.post(
          `/api/tools/upload?host=${selectedHost}`,
          formData,
          {
            headers: { 'Content-Type': 'multipart/form-data' },
            cancelToken: source.token,
            timeout: 300000,
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadProgress(prev => ({
                  ...prev,
                  [fileKey]: { ...prev[fileKey], progress: percent }
                }));
              }
            }
          }
        );

        const result = {
          fileName: file.name,
          fileSize: formatFileSize(file.size),
          url: response.data.result,
          success: true,
          rawResponse: response.data,
          timestamp: new Date().toLocaleString('id-ID')
        };

        results.push(result);
        setUploadProgress(prev => ({
          ...prev,
          [fileKey]: { status: 'berhasil', progress: 100 }
        }));

        toast.success(`${file.name} berhasil! (${i + 1}/${selectedFiles.length})`);
      } catch (error) {
        let errorMsg = 'Gagal mengunggah';
        let rawResponse = { error: error.message };

        if (axios.isCancel(error)) {
          errorMsg = 'Dibatalkan';
          rawResponse = { error: 'Upload dibatalkan' };
        } else if (error.response?.data?.error) {
          errorMsg = error.response.data.error;
          rawResponse = error.response.data;
        } else if (error.message) {
          errorMsg = error.message;
        }

        const result = {
          fileName: file.name,
          fileSize: formatFileSize(file.size),
          error: errorMsg,
          success: false,
          rawResponse,
          timestamp: new Date().toLocaleString('id-ID')
        };

        results.push(result);
        setUploadProgress(prev => ({
          ...prev,
          [fileKey]: { status: axios.isCancel(error) ? 'dibatalkan' : 'gagal', progress: 0 }
        }));

        toast.error(`${file.name}: ${errorMsg}`);
      } finally {
        cancelTokens.current.delete(fileKey);
      }
    }

    if (isMounted.current) {
      setUploadResults(results);
      const success = results.filter(r => r.success).length;
      toast.success(`Selesai: ${success} berhasil${results.length - success > 0 ? `, ${results.length - success} gagal` : ''}`);
    }

    setLoading(false);
  };

  // === Salin ke clipboard ===
  const copyToClipboard = (text, label = 'URL') => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success(`${label} disalin!`))
      .catch(() => toast.error('Gagal menyalin'));
  };

  // === Unduh semua URL ===
  const downloadAllUrls = () => {
    const urls = uploadResults
      .filter(r => r.success)
      .map(r => r.url)
      .join('\n');

    const blob = new Blob([urls], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upload-urls-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // === Format ukuran file ===
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // === Render ===
  return (
    <>
      <div className="w-full px-2 sm:px-4 py-6">
        <ToastContainer
          position="top-right"
          autoClose={3000}
          newestOnTop
          theme="colored"
          toastClassName="text-sm p-3 m-2 rounded-lg shadow-md"
        />

        <Card
          bodyClass="relative p-0 h-full overflow-hidden"
          className="w-full border border-teal-500/50 dark:border-teal-600/70 rounded-xl shadow-lg bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm"
        >
          <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700/60">
            <div className="flex flex-col sm:flex-row items-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md mb-2 sm:mb-0">
                <Icon icon="ph:cloud-arrow-up-bold" className="text-2xl sm:text-3xl" />
              </div>
              <h1 className="ml-0 sm:ml-4 text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-cyan-500 text-center sm:text-left">
                Unggah File
              </h1>
            </div>
            <p className="text-sm text-center sm:text-left text-slate-500 dark:text-slate-400 mt-2 ml-0 sm:ml-[calc(2.5rem+1rem)] md:ml-[calc(3rem+1rem)]">
              Unggah banyak file sekaligus dan dapatkan tautan langsung.
            </p>
          </div>

          <SimpleBar className="max-h-[calc(100vh-230px)]">
            <div className="p-4 sm:p-6 space-y-6">
              <form onSubmit={handleUpload} className="space-y-5">
                {/* Host Selection */}
                <div className="bg-slate-100/70 dark:bg-slate-800/40 p-4 sm:p-5 rounded-lg border border-slate-200 dark:border-slate-700/60">
                  <label htmlFor="hostSelect" className="block text-sm font-medium text-teal-700 dark:text-teal-300 mb-2 flex items-center">
                    <Icon icon="ph:globe-stand-bold" className="mr-2 text-xl" />
                    Pilih Penyedia Hosting
                  </label>
                  {hostLoading ? (
                    <div className="flex items-center p-3 bg-white dark:bg-slate-700/80 rounded border">
                      <Icon icon="ph:spinner-gap-bold" className="animate-spin mr-2" />
                      Memuat host...
                    </div>
                  ) : (
                    <select
                      id="hostSelect"
                      value={selectedHost}
                      onDChange={(e) => setSelectedHost(e.target.value)}
                      disabled={loading}
                      className="w-full p-3 rounded-md border focus:ring-1 focus:ring-teal-500 dark:bg-slate-700/80 dark:border-slate-600"
                    >
                      {availableHosts.map(host => (
                        <option key={host} value={host}>{host}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* File Input */}
                <div className="bg-slate-100/70 dark:bg-slate-800/40 p-4 sm:p-5 rounded-lg border">
                  <label className="block text-sm font-medium text-teal-700 dark:text-teal-300 mb-2 flex items-center">
                    <Icon icon="ph:folder-fill" className="mr-2 text-xl" />
                    Pilih File (Banyak)
                  </label>
                  <Fileinput
                    id="fileInput"
                    name="files"
                    multiple
                    selectedFiles={[]}
                    onChange={handleFileChange}
                    disabled={loading}
                    preview={false}
                    className="w-full"
                  />
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Maks: 100MB/file. Format: gambar, video, audio, PDF, ZIP, dll.
                  </p>

                  {selectedFiles.length > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {selectedFiles.length} file
                        </span>
                        <Button
                          text="Bersihkan"
                          onClick={clearFiles}
                          disabled={loading}
                          className="text-xs px-3 py-1"
                          type="button"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {selectedFiles.map((file, i) => {
                          const key = `${file.name}-${file.size}-${file.lastModified}`;
                          const progress = uploadProgress[key];
                          return (
                            <div key={i} className="flex items-center justify-between text-xs bg-white dark:bg-slate-700/50 p-2 rounded border">
                              <div className="flex items-center flex-1 min-w-0">
                                <Icon icon="ph:file-text-bold" className="mr-2 text-slate-500 flex-shrink-0" />
                                <span className="truncate">{file.name}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-slate-500">{formatFileSize(file.size)}</span>
                                {progress && (
                                  <span className={`text-xs font-medium ${progress.status === 'berhasil' ? 'text-green-600' : progress.status === 'gagal' ? 'text-red-600' : 'text-blue-600'}`}>
                                    {progress.progress}%
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeFile(i)}
                                  disabled={loading}
                                  className="p-1 hover:bg-red-100 dark:hover:bg-red-800/30 rounded text-red-500"
                                >
                                  <Icon icon="ph:x-bold" className="text-xs" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  text={
                    loading ? (
                      <span className="flex items-center">
                        <Icon icon="ph:spinner-gap-bold" className="animate-spin mr-2" />
                        Mengunggah...
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Icon icon="ph:upload-bold" className="mr-1.5" />
                        Unggah {selectedFiles.length} File
                      </span>
                    )
                  }
                  className="w-full py-2.5 text-sm font-semibold bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white rounded-md shadow-md disabled:opacity-70"
                  disabled={loading || selectedFiles.length === 0 || hostLoading}
                  type="submit"
                />
              </form>

              {/* Progress Upload */}
              {loading && Object.keys(uploadProgress).length > 0 && (
                <div className="mt-6 space-y-3">
                  {selectedFiles.map((file, i) => {
                    const key = `${file.name}-${file.size}-${file.lastModified}`;
                    const progress = uploadProgress[key] || { progress: 0, status: 'mengunggah' };
                    return (
                      <div key={i} className="bg-white dark:bg-slate-700/50 p-3 rounded-lg border">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium truncate flex-1">{file.name}</span>
                          <Icon
                            icon={
                              progress.status === 'berhasil' ? "ph:check-circle-bold" :
                              progress.status === 'gagal' ? "ph:x-circle-bold" :
                              progress.status === 'dibatalkan' ? "ph:prohibit-bold" :
                              "ph:spinner-gap-bold"
                            }
                            className={`ml-2 text-sm ${
                              progress.status === 'mengunggah' ? 'animate-spin text-blue-500' :
                              progress.status === 'berhasil' ? 'text-green-500' :
                              progress.status === 'dibatalkan' ? 'text-orange-500' :
                              'text-red-500'
                            }`}
                          />
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              progress.status === 'berhasil' ? 'bg-green-500' :
                              progress.status === 'gagal' || progress.status === 'dibatalkan' ? 'bg-red-500' :
                              'bg-blue-500'
                            }`}
                            style={{ width: `${progress.progress}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Hasil Upload */}
              {uploadResults.length > 0 && !loading && (
                <div className="mt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-300">
                      Hasil ({uploadResults.length})
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        text={showJsonResponse ? "Sembunyikan JSON" : "JSON"}
                        onClick={() => setShowJsonResponse(!showJsonResponse)}
                        className="text-xs px-3 py-1"
                        type="button"
                      />
                      {uploadResults.some(r => r.success) && (
                        <Button
                          text="Unduh URL"
                          onClick={downloadAllUrls}
                          className="text-xs px-3 py-1 bg-teal-600 text-white"
                          type="button"
                        />
                      )}
                    </div>
                  </div>

                  {uploadResults.map((r, i) => (
                    <div key={i} className={`p-4 rounded-lg border ${r.success ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-500/20 dark:border-emerald-500/50' : 'bg-red-50 border-red-300 dark:bg-red-500/20 dark:border-red-500/50'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon icon={r.success ? "ph:check-circle-bold" : "ph:warning-circle-bold"} className={`text-xl ${r.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} />
                            <span className={`font-medium text-sm ${r.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>{r.fileName}</span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 space-x-3">
                            <span>{r.fileSize}</span>
                            <span>{r.timestamp}</span>
                          </div>
                          {r.success ? (
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="block mt-2 text-sm text-emerald-600 dark:text-emerald-400 hover:underline break-all">
                              {r.url}
                            </a>
                          ) : (
                            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{r.error}</p>
                          )}
                          {showJsonResponse && (
                            <div className="mt-3 p-3 bg-slate-800 dark:bg-slate-900 rounded text-xs text-green-400 dark:text-green-300 font-mono overflow-x-auto">
                              <div className="flex justify-between mb-2">
                                <span className="text-slate-400">Respons:</span>
                                <Button
                                  text={<Icon icon="ph:copy-bold" className="text-sm" />}
                                  onClick={() => copyToClipboard(JSON.stringify(r.rawResponse, null, 2), r.success ? 'JSON' : 'Error')}
                                  className="p-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
                                  type="button"
                                />
                              </div>
                              <pre>{JSON.stringify(r.rawResponse, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                        {r.success && (
                          <Button
                            text={<Icon icon="ph:copy-bold" />}
                            onClick={() => copyToClipboard(r.url)}
                            className="ml-3 p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
                            type="button"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Info Box */}
              <div className="flex items-start p-3 bg-teal-50 dark:bg-teal-800/30 rounded-lg border border-teal-200 dark:border-teal-700/50 text-sm text-teal-700 dark:text-teal-300">
                <Icon icon="ph:info-bold" className="mr-3 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p>• Maksimal 100MB per file</p>
                  <p>• Dukungan gambar, video, audio, PDF, ZIP, dll</p>
                  <p>• Upload bisa dibatalkan & dipantau progressnya</p>
                  <p>• Hasil bisa diunduh sebagai file teks</p>
                </div>
              </div>
            </div>
          </SimpleBar>
        </Card>
      </div>
    </>
  );
};

export default UploaderPage;