"use client";

import SimpleBar from "simplebar-react";
import { useDispatch, useSelector } from "react-redux";
import { useState, useCallback, useEffect, useRef } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Textinput from "@/components/ui/Textinput";
import Textarea from "@/components/ui/Textarea";
import Fileinput from "@/components/ui/Fileinput";
import { ToastContainer, toast } from "react-toastify";
import { setUrl, beautifyZip } from "@/components/partials/app/beauty-js/store";
import { Icon } from '@iconify/react';

// === Konfigurasi ===
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = ['zip', 'js', 'json', 'css', 'html', 'xml'];
const ALLOWED_MIME_TYPES = [
  'application/zip', 'application/x-zip-compressed',
  'text/javascript', 'application/javascript',
  'application/json', 'text/css', 'text/html', 'application/xml', 'text/xml'
];

const BeautyPage = () => {
  const dispatch = useDispatch();
  const { url, loading, beautifiedFileUrl, error } = useSelector((state) => state.beauty);

  const [inputMode, setInputMode] = useState('text');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedFileType, setSelectedFileType] = useState('');
  const [textInput, setTextInput] = useState('');

  const fileInputRef = useRef(null);
  const isMounted = useRef(true);

  // Cleanup saat unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // === Auto-download saat berhasil ===
  useEffect(() => {
    if (beautifiedFileUrl && !loading && !error && isMounted.current) {
      const link = document.createElement('a');
      link.href = beautifiedFileUrl;
      link.style.display = 'none';

      let downloadName = 'beautified_file';

      if (inputMode === 'file' && selectedFileName) {
        const ext = selectedFileName.split('.').pop();
        downloadName = `beautified_${selectedFileName.replace(`.${ext}`, '')}.${ext}`;
      } else if (inputMode === 'url' && url) {
        const urlFileName = url.split('/').pop()?.split('?')[0] || 'file';
        const ext = urlFileName.split('.').pop() || 'js';
        downloadName = `beautified_${urlFileName}`;
      } else if (inputMode === 'text') {
        downloadName = 'beautified_code.js';
      }

      link.setAttribute('download', downloadName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("File berhasil di-beautify dan diunduh!");

      // Reset form setelah sukses
      setTimeout(() => {
        if (isMounted.current) {
          dispatch(setUrl(''));
          setTextInput('');
          setSelectedFile(null);
          setSelectedFileName('');
          setSelectedFileType('');
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }, 1000);
    } else if (error && !loading && isMounted.current) {
      toast.error(error);
    }
  }, [beautifiedFileUrl, loading, error, inputMode, selectedFileName, url, dispatch]);

  // === Handler URL ===
  const handleUrlChange = (e) => {
    dispatch(setUrl(e.target.value));
  };

  // === Handler Teks ===
  const handleTextChange = (e) => {
    setTextInput(e.target.value);
  };

  // === Validasi & Handler File ===
  const validateFile = (file) => {
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `Ukuran maksimal 50MB. File: ${file.name}` };
    }

    const ext = file.name.toLowerCase().split('.').pop();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `Ekstensi tidak didukung: ${ext}` };
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return { valid: false, error: `Tipe file tidak diizinkan: ${file.type}` };
    }

    return { valid: true };
  };

  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) {
      setSelectedFile(null);
      setSelectedFileName('');
      setSelectedFileType('');
      return;
    }

    const validation = validateFile(file);
    if (!validation.valid) {
      toast.warn(validation.error);
      setSelectedFile(null);
      setSelectedFileName('');
      setSelectedFileType('');
      e.target.value = '';
      return;
    }

    const ext = file.name.toLowerCase().split('.').pop();
    setSelectedFile(file);
    setSelectedFileName(file.name);
    setSelectedFileType(ext);

    toast.success(`${file.name} siap di-beautify!`);
  }, []);

  // === Konversi ke Base64 ===
  const convertFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Gagal membaca file"));
      reader.readAsDataURL(file);
    });
  };

  // === Proses Beautify ===
  const handleBeautify = async (e) => {
    e.preventDefault();

    if (loading) return;

    let payload = null;

    try {
      if (inputMode === 'text') {
        if (!textInput.trim()) {
          toast.warn("Masukkan kode terlebih dahulu!");
          return;
        }
        const blob = new Blob([textInput], { type: 'text/plain' });
        const file = new File([blob], 'code.js', { type: 'text/plain' });
        payload = await convertFileToBase64(file);
      } else if (inputMode === 'url') {
        if (!url.trim()) {
          toast.warn("Masukkan URL yang valid!");
          return;
        }
        if (!/^https?:\/\//i.test(url)) {
          toast.warn("URL harus dimulai dengan http:// atau https://");
          return;
        }
        payload = url;
      } else if (inputMode === 'file') {
        if (!selectedFile) {
          toast.warn("Pilih file terlebih dahulu!");
          return;
        }
        payload = await convertFileToBase64(selectedFile);
      }

      dispatch(beautifyZip(payload));
    } catch (err) {
      toast.error("Gagal memproses input: " + err.message);
    }
  };

  // === Bersihkan ===
  const clearFile = () => {
    setSelectedFile(null);
    setSelectedFileName('');
    setSelectedFileType('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    toast.info("File dibersihkan");
  };

  const clearText = () => {
    setTextInput('');
    toast.info("Teks dibersihkan");
  };

  // === Format Ukuran ===
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizesizes[i]}`;
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
                <Icon icon="material-symbols:auto-fix-high" className="text-2xl sm:text-3xl" />
              </div>
              <h1 className="ml-0 sm:ml-4 text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-cyan-500 text-center sm:text-left">
                Code Beautifier
              </h1>
            </div>
            <p className="text-sm text-center sm:text-left text-slate-500 dark:text-slate-400 mt-2 ml-0 sm:ml-[calc(2.5rem+1rem)] md:ml-[calc(3rem+1rem)]">
              Rapikan kode dari teks, URL, atau upload file — otomatis diunduh!
            </p>
          </div>

          <SimpleBar className="max-h-[calc(100vh-230px)]">
            <div className="p-4 sm:p-6 space-y-6">
              {/* Pilih Mode */}
              <div className="bg-slate-100/70 dark:bg-slate-800/40 p-4 sm:p-5 rounded-lg border">
                <label className="block text-sm font-medium text-teal-700 dark:text-teal-300 mb-3 flex items-center">
                  <Icon icon="ph:radio-button-duotone" className="mr-2 text-xl" />
                  Pilih Metode Input
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {['text', 'url', 'file'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setInputMode(mode)}
                      disabled={loading}
                      className={`p-3 rounded-md text-sm font-medium transition flex items-center justify-center ${
                        inputMode === mode
                          ? 'bg-teal-500 text-white shadow-md'
                          : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border hover:bg-slate-50 dark:hover:bg-slate-600'
                      }`}
                    >
                      <Icon
                        icon={
                          mode === 'text' ? "ph:code-duotone" :
                          mode === 'url' ? "ph:link-duotone" :
                          "ph:upload-duotone"
                        }
                        className="mr-2 text-lg"
                      />
                      {mode === 'text' ? 'Input Teks' : mode === 'url' ? 'URL File' : 'Upload File'}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleBeautify} className="space-y-5">
                {/* Input Teks */}
                {inputMode === 'text' && (
                  <div className="bg-slate-100/70 dark:bg-slate-800/40 p-4 sm:p-5 rounded-lg border">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-teal-700 dark:text-teal-300 flex items-center">
                        <Icon icon="ph:code-duotone" className="mr-2" />
                        Masukkan Kode
                      </label>
                      {textInput && (
                        <Button text="Hapus" onClick={clearText} disabled={loading} className="text-xs px-3 py-1" type="button" />
                      )}
                    </div>
                    <Textarea
                      placeholder="Paste kode JavaScript, JSON, CSS, HTML, atau XML..."
                      value={textInput}
                      onChange={handleTextChange}
                      disabled={loading}
                      rows={12}
                      className="font-mono text-sm"
                    />
                    {textInput && (
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex justify-between">
                        <span>{textInput.length} karakter</span>
                        <span>{textInput.split('\n').length} baris</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Input URL */}
                {inputMode === 'url' && (
                  <div className="bg-slate-100/70 dark:bg-slate-800/40 p-4 sm:p-5 rounded-lg border">
                    <label className="text-sm font-medium text-teal-700 dark:text-teal-300 mb-2 flex items-center">
                      <Icon icon="ph:link-duotone" className="mr-2" />
                      URL File
                    </label>
                    <Textinput
                      type="url"
                      placeholder="https://example.com/script.js"
                      value={url}
                      onChange={handleUrlChange}
                      disabled={loading}
                      className="text-sm"
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      ZIP, JS, JSON, CSS, HTML, XML
                    </p>
                  </div>
                )}

                {/* Upload File */}
                {inputMode === 'file' && (
                  <div className="bg-slate-100/70 dark:bg-slate-800/40 p-4 sm:p-5 rounded-lg border">
                    <label className="text-sm font-medium text-teal-700 dark:text-teal-300 mb-2 flex items-center">
                      <Icon icon="ph:folder-fill" className="mr-2" />
                      Pilih File
                    </label>
                    <Fileinput
                      ref={fileInputRef}
                      accept=".zip,.js,.json,.css,.html,.xml"
                      selectedFiles={selectedFile ? [selectedFile] : []}
                      onChange={handleFileChange}
                      disabled={loading}
                      preview={false}
                      className="w-full"
                    />
                    {selectedFile && (
                      <div className="mt-4 p-3 bg-white dark:bg-slate-700/50 rounded border text-xs">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-slate-600 dark:text-slate-400">File dipilih</span>
                          <Button text="Hapus" onClick={clearFile} disabled={loading} className="text-xs px-3 py-1" type="button" />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-1 min-w-0">
                            <Icon
                              icon={
                                selectedFileType === 'zip' ? "ph:file-zip-bold" :
                                selectedFileType === 'js' ? "ph:file-js-bold" :
                                selectedFileType === 'json' ? "ph:brackets-curly-bold" :
                                selectedFileType === 'css' ? "ph:file-css-bold" :
                                selectedFileType === 'html' ? "ph:file-html-bold" :
                                "ph:file-code-bold"
                              }
                              className="mr-2 text-slate-500"
                            />
                            <span className="truncate">{selectedFile.name}</span>
                          </div>
                          <span className="text-slate-500 ml-2">
                            {formatFileSize(selectedFile.size)}
                          </span>
                        </div>
                      </div>
                    )}
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Maks: 50MB. ZIP, JS, JSON, CSS, HTML, XML
                    </p>
                  </div>
                )}

                {/* Tombol Submit */}
                <Button
                  text={
                    loading ? (
                      <span className="flex items-center">
                        <Icon icon="svg-spinners:ring-resize" className="animate-spin mr-2" />
                        Memproses...
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Icon icon="ph:magic-wand-duotone" className="mr-1.5" />
                        Beautify & Download
                      </span>
                    )
                  }
                  className="w-full py-2.5 text-sm font-semibold bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white rounded-md shadow-md disabled:opacity-70"
                  disabled={
                    loading ||
                    (inputMode === 'text' && !textInput.trim()) ||
                    (inputMode === 'url' && !url.trim()) ||
                    (inputMode === 'file' && !selectedFile)
                  }
                  type="submit"
                />
              </form>

              {/* Loading State */}
              {loading && (
                <div className="mt-6 p-6 bg-slate-100/70 dark:bg-slate-800/40 rounded-lg border text-center">
                  <Icon icon="svg-spinners:blocks-shuffle-3" className="text-4xl text-teal-500 mb-3 mx-auto" />
                  <p className="text-sm text-slate-600 dark:text-teal-300">
                    Sedang memproses {inputMode === 'text' ? 'kode' : inputMode === 'file' ? 'file' : 'URL'}...
                  </p>
                </div>
              )}

              {/* Info Box */}
              <div className="flex items-start p-3 bg-teal-50 dark:bg-teal-800/30 rounded-lg border border-teal-200 dark:border-teal-700/50 text-sm text-teal-700 dark:text-teal-300">
                <Icon icon="ph:info-duotone" className="mr-3 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p>• <strong>Teks:</strong> Paste langsung kode JS/JSON/CSS/HTML/XML</p>
                  <p>• <strong>URL:</strong> Link ke file ZIP atau kode</p>
                  <p>• <strong>File:</strong> Upload dari perangkat (max 50MB)</p>
                  <p>• File otomatis terdownload setelah selesai</p>
                </div>
              </div>
            </div>
          </SimpleBar>
        </Card>
      </div>
    </>
  );
};

export default BeautyPage;