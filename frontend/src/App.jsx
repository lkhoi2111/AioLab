import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  CircleAlert,
  Download,
  FileDown,
  FileText,
  Home,
  Image,
  LoaderCircle,
  Mail,
  Menu,
  MessageCircle,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Send,
  Info,
  Trash2,
  Upload,
  Video,
  Volume2,
  Waves,
  X
} from 'lucide-react';
import PageTransition from './PageTransition.jsx';
import { apiUrl, parseApiResponse } from './config.js';

const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;
const SECTION_TRANSITION_MS = 1250;
const SCROLL_COOLDOWN = 3000;
const WHEEL_THRESHOLD = 40;
const TOUCH_THRESHOLD = 50;
const CHAT_FALLBACK =
  'Hiện ChatBot đang được phát triển trong tương lai.\nAI Music Studio được phát triển và phát hành bởi Lê Minh Khôi.';
const SPOTIFY_MESSAGE =
  'Spotify không hỗ trợ tải trực tiếp. Vui lòng upload file audio hoặc dùng nguồn bạn có quyền tải.';
const UNSUPPORTED_MESSAGE = 'Nguồn này chưa được hỗ trợ.';
const COMMAND_PLACEHOLDER = 'Thêm ảnh, video, audio, tài liệu hoặc dán link...';

const progressSteps = [
  { percent: 10, text: 'Đang chuẩn bị file...' },
  { percent: 35, text: 'Đang chạy Demucs...' },
  { percent: 65, text: 'Đang tách stem...' },
  { percent: 90, text: 'Đang lưu kết quả...' },
  { percent: 100, text: 'Hoàn tất' }
];

const downloaderStages = [
  { percent: 18, text: 'Đang kiểm tra link...' },
  { percent: 42, text: 'Đang tải media...' },
  { percent: 68, text: 'Đang chuyển đổi...' },
  { percent: 88, text: 'Đang lưu file...' },
  { percent: 100, text: 'Hoàn tất' }
];

const stemLabels = {
  vocals: 'Vocal',
  instrumental: 'Instrumental',
  drums: 'Drums',
  bass: 'Bass',
  other: 'Other'
};

const hubPills = ['Audio', 'Video', 'Image', 'Document', 'Downloader', 'AI'];
const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'downloader', label: 'Downloader', icon: FileDown },
  { id: 'studio', label: 'Audio', icon: Volume2 },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'image', label: 'Image', icon: Image },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'ai', label: 'AI Chat', icon: Bot },
  { id: 'about', label: 'About App', icon: Info }
];

const starterMessages = [
  {
    role: 'assistant',
    source: 'AioLab',
    content: CHAT_FALLBACK
  }
];

function backendAssetUrl(value) {
  if (!value || typeof value !== 'string') return value;
  if (/^(https?:|data:|blob:|mailto:|tel:|#)/i.test(value)) return value;
  if (/^\/(uploads|results|downloads|separated)\//.test(value)) return apiUrl(value);
  return value;
}

export default function App() {
  const [activeView, setActiveView] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [hubValue, setHubValue] = useState('');
  const [hubMessage, setHubMessage] = useState('');
  const [routedAsset, setRoutedAsset] = useState(null);
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('ai-music-studio-chat');
    return saved ? JSON.parse(saved) : starterMessages;
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [upload, setUpload] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState('');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [downloaderUrl, setDownloaderUrl] = useState('');
  const [downloaderInfo, setDownloaderInfo] = useState(null);
  const [downloaderResult, setDownloaderResult] = useState(null);
  const [downloaderBusy, setDownloaderBusy] = useState(false);
  const [downloaderProgress, setDownloaderProgress] = useState(null);
  const [downloaderError, setDownloaderError] = useState('');
  const [videoExtractFile, setVideoExtractFile] = useState(null);
  const [videoExtractFormat, setVideoExtractFormat] = useState('mp3');
  const [videoExtractProgress, setVideoExtractProgress] = useState(null);
  const [videoExtractResult, setVideoExtractResult] = useState(null);
  const [videoExtractError, setVideoExtractError] = useState('');
  const [videoExtractBusy, setVideoExtractBusy] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [comingSoonTool, setComingSoonTool] = useState('');
  const fileInputRef = useRef(null);
  const hubFileInputRef = useRef(null);
  const videoExtractInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const aboutSectionRef = useRef(null);
  const touchStartYRef = useRef(0);
  const touchEnabledRef = useRef(false);
  const isAnimatingRef = useRef(false);
  const isScrollLockedRef = useRef(false);
  const pendingAboutScrollRef = useRef(false);
  const progressTimersRef = useRef([]);
  const downloaderTimersRef = useRef([]);
  const videoExtractTimersRef = useRef([]);
  const [activeSection, setActiveSection] = useState(0);

  const currentPath = window.location.pathname;
  const isHomeRoute = currentPath === '/' || currentPath === '/home';
  const isHomePage = isHomeRoute && activeView === 'home';
  const hasUpload = Boolean(upload);
  const canUseFile = hasUpload && !uploadBusy && !processing;
  const displayName = upload?.originalName || upload?.displayName || '';

  const sortedFiles = useMemo(() => {
    if (!result?.files) return [];
    const order = ['vocals', 'instrumental', 'drums', 'bass', 'other'];
    return [...result.files].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  }, [result]);

  const downloaderFormats = useMemo(() => {
    if (!downloaderInfo) return [];
    if (downloaderInfo.platform === 'soundcloud' || downloaderInfo.type === 'audio') return ['mp3'];
    return downloaderInfo.availableFormats || ['mp3', 'mp4'];
  }, [downloaderInfo]);

  useEffect(() => {
    localStorage.setItem('ai-music-studio-chat', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (!chatOpen) return;
    const messagesEl = chatEndRef.current?.parentElement;
    messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  }, [messages, chatBusy, chatOpen]);

  useEffect(() => {
    return () => {
      clearProgressTimers();
      clearDownloaderTimers();
      clearVideoExtractTimers();
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('home-about-active', isHomePage);

    return () => {
      document.body.classList.remove('home-about-active');
    };
  }, [isHomePage]);

  useEffect(() => {
    if (isHomePage) return;

    isAnimatingRef.current = false;
    isScrollLockedRef.current = false;
    setActiveSection(0);
    window.scrollTo(0, 0);
  }, [isHomePage]);

  useEffect(() => {
    if (!isHomePage || !pendingAboutScrollRef.current) return;

    pendingAboutScrollRef.current = false;
    window.setTimeout(() => {
      goToSection(1);
    }, 40);
  }, [isHomePage]);

  useEffect(() => {
    if (!isHomePage) return undefined;

    function onWheel(event) {
      event.preventDefault();
      handleSectionWheel(event);
    }

    function onTouchMove(event) {
      if (activeSection === 1 && event.target?.closest?.('.about-section')) return;
      event.preventDefault();
    }

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [isHomePage, activeSection]);

  async function sendMessage(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || chatBusy) return;

    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setChatInput('');
    setChatBusy(true);

    try {
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ messages: nextMessages })
      });
      const data = await parseApiResponse(response);

      setMessages((current) => [
        ...current,
        { role: 'assistant', source: data.source || 'AioLab', content: data.reply || CHAT_FALLBACK }
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: 'assistant', source: 'AioLab', content: CHAT_FALLBACK }
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  async function handleUpload(file) {
    if (!file || uploadBusy || processing) return;

    if (file.size > MAX_UPLOAD_SIZE) {
      setStatusMessage('File audio phải nhỏ hơn hoặc bằng 100 MB.');
      return;
    }

    const formData = new FormData();
    formData.append('audio', file);
    setUploadBusy(true);
    setResult(null);
    setProgress(null);
    setAnalysis(null);
    setAnalysisError('');
    setStatusMessage('Đang upload audio...');

    try {
      const response = await fetch(apiUrl('/api/upload'), { method: 'POST', body: formData });
      const data = await parseApiResponse(response);

      const uploadedFile = normalizeUploadedFile(data);
      setUpload(uploadedFile);
      setStatusMessage('');
      analyzeFile(uploadedFile);
    } catch (error) {
      setUpload(null);
      setStatusMessage(`Upload lỗi: ${error.message}`);
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (hubFileInputRef.current) hubFileInputRef.current.value = '';
    }
  }

  async function analyzeFile(file = upload, options = {}) {
    if (!file?.storedName && !file?.fileName) return;
    setAnalysisBusy(true);
    setAnalysisError('');

    try {
      const response = await fetch(apiUrl('/api/audio/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ fileName: file.storedName || file.fileName, force: Boolean(options.force) })
      });
      const data = await parseApiResponse(response);
      if (!data.ok) throw new Error(data.detail || data.error || 'Không thể phân tích audio.');

      setUpload((current) => ({
        ...(current || file),
        ...(data.file || {}),
        url: backendAssetUrl(data.file?.url || current?.url || file.url)
      }));
      setAnalysis(data.analysis || null);
    } catch {
      setAnalysis(null);
      setAnalysisError('Chưa phân tích được BPM/Key, bạn có thể thử lại.');
    } finally {
      setAnalysisBusy(false);
    }
  }

  async function separateAll() {
    if (!canUseFile) return;
    clearProgressTimers();
    setProcessing(true);
    setResult(null);
    setProgress(progressSteps[0]);

    progressTimersRef.current = progressSteps.slice(1, -1).map((step, index) =>
      window.setTimeout(() => setProgress((current) => (current?.error ? current : step)), [900, 3500, 8500][index])
    );

    try {
      const response = await fetch(apiUrl('/api/audio/separate-all'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ fileName: upload.storedName || upload.fileName })
      });
      const data = await parseApiResponse(response);
      if (!data.ok) throw new Error(data.detail || data.error || 'Không thể tách nhạc.');

      clearProgressTimers();
      setProgress(progressSteps.at(-1));
      setResult({
        ...data,
        files: data.files?.map((item) => ({
          ...item,
          url: backendAssetUrl(item.url),
          downloadUrl: backendAssetUrl(item.downloadUrl)
        }))
      });
    } catch (error) {
      clearProgressTimers();
      setProgress({ percent: 100, text: `Tách nhạc lỗi: ${error.message}`, error: true });
    } finally {
      setProcessing(false);
    }
  }

  async function deleteFile() {
    if (!upload || uploadBusy || processing) return;
    try {
      await fetch(apiUrl('/api/audio/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ fileName: upload.storedName || upload.fileName })
      });
    } finally {
      clearProgressTimers();
      setUpload(null);
      setAnalysis(null);
      setAnalysisError('');
      setResult(null);
      setProgress(null);
      setStatusMessage('');
    }
  }

  async function checkDownloaderLink(input) {
    if (input?.preventDefault) input.preventDefault();
    const url = typeof input === 'string' ? input.trim() : downloaderUrl.trim();
    if (!url || downloaderBusy) return;

    const validationError = validateDownloaderUrl(url);
    if (validationError) {
      setDownloaderError(validationError);
      setDownloaderInfo(null);
      setDownloaderResult(null);
      setDownloaderProgress(null);
      return;
    }

    setDownloaderUrl(url);
    clearDownloaderTimers();
    setDownloaderBusy(true);
    setDownloaderError('');
    setDownloaderInfo(null);
    setDownloaderResult(null);
    setDownloaderProgress(downloaderStages[0]);

    try {
      const response = await fetch(apiUrl('/api/downloader/info'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ url })
      });
      const data = await parseApiResponse(response);
      if (!data.ok) throw new Error(data.error || UNSUPPORTED_MESSAGE);

      setDownloaderInfo({
        ...data,
        thumbnail: backendAssetUrl(data.thumbnail)
      });
      setDownloaderProgress(null);
    } catch (error) {
      setDownloaderError(error.message || UNSUPPORTED_MESSAGE);
      setDownloaderProgress(null);
    } finally {
      setDownloaderBusy(false);
    }
  }

  async function downloadMedia(format) {
    if (!downloaderUrl.trim() || downloaderBusy) return;
    clearDownloaderTimers();
    setDownloaderBusy(true);
    setDownloaderError('');
    setDownloaderResult(null);
    setDownloaderProgress(downloaderStages[1]);

    downloaderTimersRef.current = downloaderStages.slice(2, -1).map((stage, index) =>
      window.setTimeout(() => setDownloaderProgress((current) => (current?.error ? current : stage)), [1600, 4200][index])
    );

    try {
      const response = await fetch(apiUrl('/api/downloader/download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ url: downloaderUrl.trim(), format, quality: 'best' })
      });
      const data = await parseApiResponse(response);
      if (!data.ok) throw new Error(data.error || 'Không thể tải media này.');

      clearDownloaderTimers();
      setDownloaderProgress(downloaderStages.at(-1));
      setDownloaderResult({
        ...data,
        downloadUrl: backendAssetUrl(data.downloadUrl),
        url: backendAssetUrl(data.url)
      });
    } catch (error) {
      clearDownloaderTimers();
      setDownloaderProgress({ percent: 100, text: error.message || 'Tải lỗi', error: true });
      setDownloaderError(error.message || 'Không thể tải media này.');
    } finally {
      setDownloaderBusy(false);
    }
  }

  async function useInAudioTools() {
    if (!downloaderResult?.fileName || downloaderResult.format !== 'mp3') {
      setDownloaderError('Hãy tải MP3 trước khi gửi sang Audio Tools.');
      return;
    }

    setDownloaderBusy(true);
    setDownloaderError('');
    try {
      const response = await fetch(apiUrl('/api/downloader/use-in-audio-tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ fileName: downloaderResult.fileName })
      });
      const data = await parseApiResponse(response);
      if (!data.ok) throw new Error(data.error || 'Không thể gửi file sang Audio Tools.');

      const audioFile = normalizeUploadedFile(data);
      setUpload(audioFile);
      setResult(null);
      setProgress(null);
      setAnalysis(null);
      setAnalysisError('');
      setActiveView('studio');
      analyzeFile(audioFile);
    } catch (error) {
      setDownloaderError(error.message || 'Không thể gửi file sang Audio Tools.');
    } finally {
      setDownloaderBusy(false);
    }
  }

  async function handleVideoExtractFile(file) {
    if (!file || videoExtractBusy) return;

    if (file.size > MAX_UPLOAD_SIZE) {
      setVideoExtractError('Video size must be under 100MB.');
      setVideoExtractFile(null);
      setVideoExtractResult(null);
      setVideoExtractProgress(null);
      return;
    }

    if (detectFileKind(file) !== 'video') {
      setVideoExtractError('Unsupported video format.');
      setVideoExtractFile(null);
      setVideoExtractResult(null);
      setVideoExtractProgress(null);
      return;
    }

    setVideoExtractError('');
    setVideoExtractResult(null);
    setVideoExtractProgress(null);

    const duration = await readVideoDuration(file).catch(() => 0);
    setVideoExtractFile({
      file,
      name: file.name,
      size: file.size,
      sizeMB: (file.size / 1024 / 1024).toFixed(2),
      duration
    });
  }

  async function extractAudio() {
    if (!videoExtractFile?.file || videoExtractBusy) return;

    clearVideoExtractTimers();
    setVideoExtractBusy(true);
    setVideoExtractError('');
    setVideoExtractResult(null);
    setVideoExtractProgress({ percent: 14, text: 'Processing...' });

    videoExtractTimersRef.current = [
      window.setTimeout(() => setVideoExtractProgress((current) => (current?.error ? current : { percent: 36, text: 'Uploading video...' })), 600),
      window.setTimeout(() => setVideoExtractProgress((current) => (current?.error ? current : { percent: 62, text: 'Extracting audio...' })), 1700),
      window.setTimeout(() => setVideoExtractProgress((current) => (current?.error ? current : { percent: 86, text: 'Saving output...' })), 3200)
    ];

    try {
      const formData = new FormData();
      formData.append('video', videoExtractFile.file);
      formData.append('format', videoExtractFormat);

      const response = await fetch(apiUrl('/api/extract-audio'), {
        method: 'POST',
        body: formData
      });
      const data = await parseApiResponse(response);
      if (!data.success) {
        throw new Error(data.message || 'Audio extraction failed.');
      }

      clearVideoExtractTimers();
      setVideoExtractProgress({ percent: 100, text: 'Completed' });
      setVideoExtractResult({
        ...data,
        downloadUrl: backendAssetUrl(data.downloadUrl),
        url: backendAssetUrl(data.url)
      });
    } catch (error) {
      clearVideoExtractTimers();
      setVideoExtractProgress({ percent: 100, text: 'Failed', error: true });
      setVideoExtractError(error.message || 'Audio extraction failed.');
    } finally {
      setVideoExtractBusy(false);
      if (videoExtractInputRef.current) videoExtractInputRef.current.value = '';
    }
  }

  async function routeFile(file) {
    if (!file) return;
    const kind = detectFileKind(file);
    setHubMessage('');
    setRoutedAsset(makeRoutedAsset(file, kind));

    if (kind === 'audio') {
      setActiveView('studio');
      await handleUpload(file);
      return;
    }

    if (kind === 'video') {
      setActiveView('video');
      await handleVideoExtractFile(file);
      return;
    }

    if (['image', 'documents'].includes(kind)) {
      openComingSoonModal(kind === 'image' ? 'Image' : 'Documents');
      return;
    }

    setActiveView('ai');
    setHubMessage('Định dạng này chưa có công cụ riêng. Tôi đã chuyển bạn sang AI Chat.');
    setChatOpen(true);
  }

  async function routeCommand(event) {
    event.preventDefault();
    const value = hubValue.trim();
    if (!value) {
      hubFileInputRef.current?.click();
      return;
    }

    const urlKind = detectUrlKind(value);
    setHubMessage('');

    if (urlKind === 'downloader') {
      setActiveView('downloader');
      setDownloaderUrl(value);
      setHubValue('');
      await checkDownloaderLink(value);
      return;
    }

    if (urlKind === 'spotify') {
      setActiveView('downloader');
      setDownloaderUrl(value);
      setDownloaderError(SPOTIFY_MESSAGE);
      setHubValue('');
      return;
    }

    if (urlKind === 'unsupported') {
      setHubMessage(UNSUPPORTED_MESSAGE);
      return;
    }

    setActiveView('ai');
    setChatOpen(true);
    setHubValue('');
  }

  function clearProgressTimers() {
    progressTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    progressTimersRef.current = [];
  }

  function clearDownloaderTimers() {
    downloaderTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    downloaderTimersRef.current = [];
  }

  function clearVideoExtractTimers() {
    videoExtractTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    videoExtractTimersRef.current = [];
  }

  function isInteractiveTarget(target) {
    return Boolean(
      target?.closest?.(
          'input, textarea, select, button, a, audio, .chat-popup, .app-sidebar, .sidebar-overlay, .command-box, .downloader-form, .chat-dev-body, .messages'
      )
    );
  }

  function openComingSoonModal(tool = 'Tính năng này') {
    setComingSoonTool(tool);
    setComingSoonOpen(true);
  }

  function handleToolClick(tool) {
    const key = tool.toLowerCase();
    const comingSoonTools = ['image', 'document', 'documents'];

    if (comingSoonTools.includes(key)) {
      openComingSoonModal(tool);
      return;
    }

    if (key === 'audio') {
      setActiveView('studio');
      return;
    }

    if (key === 'video') {
      setActiveView('video');
      return;
    }

    if (key === 'downloader') {
      setActiveView('downloader');
      return;
    }

    if (key === 'ai') {
      setActiveView('ai');
      setChatOpen(true);
    }
  }

  function lockScroll() {
    isScrollLockedRef.current = true;

    window.setTimeout(() => {
      isScrollLockedRef.current = false;
    }, SCROLL_COOLDOWN);
  }

  function canScrollSection() {
    return !isAnimatingRef.current && !isScrollLockedRef.current;
  }

  function goToSection(index) {
    if (!isHomePage || !canScrollSection()) return;
    if (index < 0 || index > 1) return;
    if (index === activeSection) return;

    isAnimatingRef.current = true;
    setActiveSection(index);
    lockScroll();

    window.setTimeout(() => {
      isAnimatingRef.current = false;
    }, SECTION_TRANSITION_MS);
  }

  function scrollToAbout() {
    goToSection(1);
  }

  function scrollToHome() {
    goToSection(0);
  }

  function handleSectionWheel(event) {
    if (!isHomePage) return;
    if (isInteractiveTarget(event.target)) return;
    if (!canScrollSection()) return;

    if (event.deltaY > WHEEL_THRESHOLD && activeSection === 0) {
      scrollToAbout();
      return;
    }

    if (event.deltaY < -WHEEL_THRESHOLD && activeSection === 1) {
      scrollToHome();
    }
  }

  function handleSectionTouchStart(event) {
    if (!isHomePage) return;
    if (isInteractiveTarget(event.target)) {
      touchEnabledRef.current = false;
      return;
    }

    touchEnabledRef.current = true;
    touchStartYRef.current = event.touches?.[0]?.clientY || 0;
  }

  function handleSectionTouchEnd(event) {
    if (!isHomePage) return;
    if (!touchEnabledRef.current || !canScrollSection()) return;

    const endY = event.changedTouches?.[0]?.clientY || 0;
    const diff = touchStartYRef.current - endY;

    if (Math.abs(diff) < TOUCH_THRESHOLD) return;

    if (diff > 0 && activeSection === 0) {
      scrollToAbout();
      return;
    }

    if (diff < 0 && activeSection === 1) {
      const aboutEl = event.target?.closest?.('.about-section');
      if (aboutEl?.scrollTop > 4) return;
      scrollToHome();
    }
  }

  function renderNavigation() {
    return (
      <>
        <button
          className={`hamburger-btn ${sidebarOpen ? 'active' : ''}`}
          type="button"
          onClick={() => setSidebarOpen((current) => !current)}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          aria-expanded={sidebarOpen}
        >
          <Menu size={21} />
        </button>

        <button
          className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
          tabIndex={sidebarOpen ? 0 : -1}
        />

        <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-top">
            {renderSidebarLogo()}
            <strong>AioLab</strong>
          </div>
          <nav>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === 'about' ? isHomePage && activeSection === 1 : activeView === item.id && activeSection === 0;
              return (
                <button
                  key={item.id}
                  className={isActive ? 'active' : ''}
                  type="button"
                  onClick={() => {
                    if (item.id === 'about') {
                      if (isHomePage) {
                        scrollToAbout();
                      } else {
                        pendingAboutScrollRef.current = true;
                        setActiveSection(0);
                        setActiveView('home');
                      }
                    } else if (['image', 'documents'].includes(item.id)) {
                      openComingSoonModal(item.label);
                      return;
                    } else {
                      setActiveView(item.id);
                      if (isHomePage && activeSection === 1) {
                        scrollToHome();
                      } else {
                        setActiveSection(0);
                      }
                    }
                    setSidebarOpen(false);
                  }}
                  title={item.label}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      </>
    );
  }

  function renderAppChrome(content, { home = false } = {}) {
    return (
      <div
        className={`studio-page ${sidebarOpen ? 'sidebar-open' : ''}`}
        onDrop={(event) => {
          event.preventDefault();
          routeFile(event.dataTransfer.files?.[0]);
        }}
        onDragOver={(event) => event.preventDefault()}
      >
        {renderNavigation()}
        {content}

        {home && activeSection === 0 && (
          <motion.button
            className="swipe-arrow-hint"
            type="button"
            onClick={scrollToAbout}
            style={{ x: '-50%' }}
            animate={{
              opacity: [0.18, 0.32, 0.18],
              y: [6, 0, 6]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          >
            <span>⌃</span>
            <span>⌃</span>
            <span>⌃</span>
          </motion.button>
        )}

        {home && activeSection === 1 && (
          <motion.button
            className="about-return-indicator"
            type="button"
            onClick={scrollToHome}
            aria-label="Back to Home"
            animate={{
              opacity: [0.16, 0.25, 0.16],
              y: [-4, 0, -4]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          >
            <span>⌄</span>
            <span>⌄</span>
            <span>⌄</span>
          </motion.button>
        )}

        <footer className="page-footer">© 2026 AioLab. Developed by Lê Minh Khôi.</footer>

        <button
          className="chat-fab"
          type="button"
          onClick={() => setChatOpen((current) => !current)}
          title={chatOpen ? 'Đóng chat' : 'Mở chat'}
        >
          {chatOpen ? <X size={22} /> : <MessageCircle size={23} />}
        </button>

        <AnimatePresence>
          {chatOpen && renderChat()}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <>
    <div
      className={`app-sections ${isHomePage ? 'home-page home-about-shell' : 'tool-page'}`}
      {...(isHomePage
        ? {
            onTouchStart: handleSectionTouchStart,
            onTouchEnd: handleSectionTouchEnd
          }
        : {})}
    >
      {isHomePage ? (
      <div className={`sections-track ${isHomePage ? 'home-about-track' : ''} ${isHomePage && activeSection === 0 ? 'home-active' : ''} ${isHomePage && activeSection === 1 ? 'is-about about-active' : ''}`}>
      <section
        className="app-section home-section"
      >
        <div className="home-content">
        <div
      className={`studio-page ${sidebarOpen ? 'sidebar-open' : ''}`}
      onDrop={(event) => {
        event.preventDefault();
        routeFile(event.dataTransfer.files?.[0]);
      }}
      onDragOver={(event) => event.preventDefault()}
    >
      <button
        className={`hamburger-btn ${sidebarOpen ? 'active' : ''}`}
        type="button"
        onClick={() => setSidebarOpen((current) => !current)}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        aria-expanded={sidebarOpen}
      >
        <Menu size={21} />
      </button>

      <button
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        type="button"
        onClick={() => setSidebarOpen(false)}
        aria-label="Close sidebar"
        tabIndex={sidebarOpen ? 0 : -1}
      />

      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          {renderSidebarLogo()}
          <strong>AioLab</strong>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === 'about' ? isHomePage && activeSection === 1 : activeView === item.id && activeSection === 0;
            return (
              <button
                key={item.id}
                className={isActive ? 'active' : ''}
                type="button"
                onClick={() => {
                  if (item.id === 'about') {
                    if (isHomePage) {
                      scrollToAbout();
                    } else {
                      pendingAboutScrollRef.current = true;
                      setActiveSection(0);
                      setActiveView('home');
                    }
                  } else if (['image', 'documents'].includes(item.id)) {
                    openComingSoonModal(item.label);
                    return;
                  } else {
                    setActiveView(item.id);
                    if (isHomePage && activeSection === 1) {
                      scrollToHome();
                    } else {
                      setActiveSection(0);
                    }
                  }
                  setSidebarOpen(false);
                }}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <AnimatePresence mode="wait">
        <PageTransition
          key={activeView}
          className={`studio-main ${activeView === 'home' ? 'home-main' : 'tool-main'} ${hasUpload ? 'has-upload' : ''}`}
        >
          {renderActiveView()}
        </PageTransition>
      </AnimatePresence>

      {isHomePage && activeSection === 0 && (
        <motion.button
          className="swipe-arrow-hint"
          type="button"
          onClick={scrollToAbout}
          style={{ x: '-50%' }}
          animate={{
            opacity: [0.18, 0.32, 0.18],
            y: [6, 0, 6]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        >
          <span>⌃</span>
          <span>⌃</span>
          <span>⌃</span>
        </motion.button>
      )}

      {isHomePage && activeSection === 1 && (
        <motion.button
          className="about-return-indicator"
          type="button"
          onClick={scrollToHome}
          aria-label="Back to Home"
          animate={{
            opacity: [0.16, 0.25, 0.16],
            y: [-4, 0, -4]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        >
          <span>⌄</span>
          <span>⌄</span>
          <span>⌄</span>
        </motion.button>
      )}

      <footer className="page-footer">© 2026 AioLab. Developed by Lê Minh Khôi.</footer>

      <button
        className="chat-fab"
        type="button"
        onClick={() => setChatOpen((current) => !current)}
        title={chatOpen ? 'Đóng chat' : 'Mở chat'}
      >
        {chatOpen ? <X size={22} /> : <MessageCircle size={23} />}
      </button>

      <AnimatePresence>
        {chatOpen && renderChat()}
      </AnimatePresence>

        </div>
        </div>
      </section>

      {isHomePage && renderAboutSection()}
      </div>
      ) : (
        renderAppChrome(
          <AnimatePresence mode="wait">
            <PageTransition
              key={activeView}
              className={`page-layout ${hasUpload ? 'has-upload' : ''}`}
            >
              <div className="page-content">
                {renderActiveView()}
              </div>
            </PageTransition>
          </AnimatePresence>
        )
      )}
    </div>
    {isHomePage && activeSection === 1 && (
      <button
        type="button"
        className="about-close-btn"
        onClick={() => goToSection(0)}
        aria-label="Đóng About App"
      >
        ×
      </button>
    )}
    <AnimatePresence>
      {comingSoonOpen && renderComingSoonModal()}
    </AnimatePresence>
    </>
  );

  function renderComingSoonModal() {
    return (
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => setComingSoonOpen(false)}
      >
        <motion.div
          className="coming-soon-modal"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="coming-soon-icon">🚧</div>
          <h2>Tính năng đang phát triển</h2>
          <p>{comingSoonTool || 'Tính năng này'} hiện đang trong quá trình phát triển và tối ưu trải nghiệm người dùng.</p>
          <p>Hãy quay lại sau để trải nghiệm tính năng này trong các bản cập nhật tiếp theo của AioLab.</p>
          <button type="button" onClick={() => setComingSoonOpen(false)}>Đã hiểu</button>
        </motion.div>
      </motion.div>
    );
  }

  function renderAboutSection() {
    const cards = [
      {
        title: 'AioLab là gì?',
        body: [
          'AioLab là nền tảng công cụ đa năng được xây dựng nhằm đơn giản hóa các tác vụ xử lý nội dung số hằng ngày. Với định hướng tập trung vào tốc độ, tính ổn định và trải nghiệm người dùng, AioLab mang đến một không gian làm việc thống nhất, nơi nhiều công cụ hữu ích được tích hợp trong cùng một ứng dụng.',
          'Thay vì phải sử dụng nhiều phần mềm hoặc trang web khác nhau, người dùng có thể thực hiện hầu hết các nhu cầu phổ biến như tải xuống nội dung, tách âm thanh từ video, chuyển đổi định dạng tệp và kiểm tra trạng thái dịch vụ ngay trên một nền tảng duy nhất.'
        ]
      },
      {
        title: 'Features',
        features: [
          ['Tải xuống nội dung đa phương tiện', 'Hỗ trợ tải video và âm thanh từ nhiều nguồn khác nhau với tốc độ xử lý nhanh và giao diện trực quan.'],
          ['Tách âm thanh từ video', 'Cho phép chuyển đổi video sang các định dạng âm thanh phổ biến như MP3, WAV hoặc M4A với chất lượng cao.'],
          ['Chuyển đổi định dạng tệp', 'Hỗ trợ chuyển đổi giữa nhiều định dạng phương tiện nhằm đáp ứng nhu cầu sử dụng trên nhiều thiết bị và nền tảng khác nhau.'],
          ['Kiểm tra trạng thái API', 'Theo dõi tình trạng hoạt động của các dịch vụ và API thông qua giao diện đơn giản, dễ sử dụng.'],
          ['Tối ưu cho mọi thiết bị', 'AioLab được thiết kế theo tiêu chuẩn Responsive hiện đại, mang lại trải nghiệm mượt mà trên cả máy tính, máy tính bảng và điện thoại di động.']
        ]
      },
      {
        title: 'Why AioLab?',
        bullets: [
          'Giao diện hiện đại, trực quan và dễ sử dụng.',
          'Hiệu năng nhanh, tối ưu và ổn định.',
          'Tích hợp nhiều công cụ trong một nền tảng duy nhất.',
          'Hỗ trợ tốt trên cả Desktop và Mobile.',
          'Liên tục được cập nhật và cải tiến.'
        ],
        body: [
          'AioLab không chỉ là một bộ công cụ đơn thuần mà còn là một hệ sinh thái đang phát triển, được xây dựng để phục vụ người dùng trong các nhu cầu xử lý nội dung số một cách nhanh chóng, tiện lợi và hiệu quả.'
        ]
      },
      {
        title: 'Creator',
        body: [
          'AioLab được phát triển bởi Lê Minh Khôi với mong muốn tạo ra một nền tảng công cụ hiện đại, mạnh mẽ nhưng vẫn dễ tiếp cận với mọi đối tượng người dùng.',
          'Mỗi tính năng trong AioLab đều được xây dựng dựa trên ba giá trị cốt lõi: Hiệu năng - Trải nghiệm - Sự tiện lợi.',
          'Đó cũng chính là định hướng phát triển lâu dài của dự án trong tương lai.'
        ]
      }
    ];

    return (
      <section
        ref={aboutSectionRef}
        className="app-section about-section"
      >
        <motion.div
          className="about-shell about-content"
          animate={{
            opacity: activeSection === 1 ? 1 : 0,
            y: activeSection === 1 ? 0 : 32,
            filter: activeSection === 1 ? 'blur(0px)' : 'blur(8px)'
          }}
          transition={{
            duration: 0.75,
            ease: [0.22, 1, 0.36, 1]
          }}
        >
          <div
            className="about-heading"
          >
            <span className="hero-kicker about-label">ABOUT APP</span>
            <h1 className="about-title">About AioLab</h1>
            <p>Một không gian làm việc thống nhất cho các công cụ xử lý nội dung số hằng ngày.</p>
          </div>

          <div className="about-grid about-top-grid">
            {cards.map((card, index) => (
              <article
                className={`about-card ${index === 0 ? 'intro-card' : ''} ${index === 1 ? 'features-card features-section' : ''} ${index === 2 ? 'why-card why-section' : ''} ${index === 3 ? 'creator-card' : ''}`}
                key={card.title}
              >
                <h2>{card.title}</h2>
                {index !== 2 && card.body?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {card.features && (
                  <div className="feature-list features-grid">
                    {card.features.map(([title, description]) => (
                      <div className="feature-item feature-card" key={title}>
                        <h3>{title}</h3>
                        <p>{description}</p>
                      </div>
                    ))}
                  </div>
                )}
                {card.bullets && (
                  <div className="why-list">
                    {['Giao diện hiện đại', 'Hiệu năng nhanh', 'Tích hợp nhiều công cụ', 'Tối ưu Desktop & Mobile', 'Liên tục cải tiến'].map((item) => (
                      <span className="why-chip" key={item}>{item}</span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>

        </motion.div>
      </section>
    );
  }

  function renderActiveView() {
    if (activeView === 'home') return renderHome();
    if (activeView === 'studio') return renderStudio();
    if (activeView === 'downloader') return renderDownloader();
    if (activeView === 'audio') return renderToolPlaceholder('Audio Tools', 'BPM, Key, Chord, Stem Splitter', ['BPM', 'Key', 'Chord', 'Stem Splitter']);
    if (activeView === 'video') return renderVideoTools();
    if (activeView === 'image') return renderToolPlaceholder('Image Tools', 'Compress, Convert, Remove Background', ['Compress', 'Convert', 'Remove Background']);
    if (activeView === 'documents') return renderToolPlaceholder('Documents', 'PDF <-> Word, Merge, Compress, OCR', ['PDF <-> Word', 'Merge', 'Compress', 'OCR']);
    if (activeView === 'ai') return renderAiView();
    return renderHome();
  }

  function renderHome() {
    return (
      <section className="hero">
        {renderMainLogo()}
        <p>Thêm ảnh, video, audio, tài liệu hoặc dán link để bắt đầu.</p>
        <form
          className="command-box"
          onSubmit={routeCommand}
          onDrop={(event) => {
            event.preventDefault();
            routeFile(event.dataTransfer.files?.[0]);
          }}
        >
          <button className="command-add" type="button" onClick={() => hubFileInputRef.current?.click()}>
            <Plus size={22} />
          </button>
          <input
            value={hubValue}
            onChange={(event) => setHubValue(event.target.value)}
            placeholder={COMMAND_PLACEHOLDER}
          />
          <button className="command-submit" type="submit">Start</button>
          <input
            ref={hubFileInputRef}
            className="file-input"
            type="file"
            accept=".mp3,.wav,.flac,.mp4,.mov,.mkv,.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,audio/*,video/*,image/*,application/pdf"
            onChange={(event) => routeFile(event.target.files?.[0])}
          />
        </form>
        {hubMessage && <div className="status-message">{hubMessage}</div>}
        <div className="hub-pills">
          {hubPills.map((pill) => (
            <button key={pill} type="button" onClick={() => handleToolClick(pill)}>
              {pill}
            </button>
          ))}
        </div>
      </section>
    );
  }

  function renderMainLogo() {
    if (logoFailed) return null;

    return (
      <div className="logo-wrapper">
        <img
          className="logo-main"
          src="/assets/logo/logo.png"
          alt="AioLab"
          onError={() => setLogoFailed(true)}
        />
        <div className="logo-glow" />
      </div>
    );
  }

  function renderSidebarLogo() {
    if (logoFailed) return <span className="sidebar-logo-text">AioLab</span>;

    return (
      <img
        className="sidebar-logo"
        src="/assets/logo/logo.png"
        alt="AioLab"
        onError={() => setLogoFailed(true)}
      />
    );
  }

  function renderStudio() {
    return (
      <section className="tool-view">
        <div className="tool-heading">
          <span className="hero-kicker">AUDIO TOOLS</span>
          <h1>BPM, Key, Chord, Stem Splitter</h1>
          <p>Upload audio hoặc dùng MP3 từ Downloader để phân tích và tách stem.</p>
          {!hasUpload && (
            <button className="browse-button" type="button" onClick={() => fileInputRef.current?.click()}>
              {uploadBusy ? <LoaderCircle className="spin" size={18} /> : <Upload size={18} />}
              <span>Upload audio</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept=".mp3,.wav,.flac,audio/mpeg,audio/wav,audio/flac"
            onChange={(event) => routeFile(event.target.files?.[0])}
          />
          {statusMessage && <div className="status-message">{statusMessage}</div>}
        </div>

        {hasUpload && (
          <section className="workspace-card">
            <audio controls src={backendAssetUrl(upload.url)} />
            <div className="compact-section">
              <div className="section-title">Thông tin bài nhạc</div>
              <div className="info-grid">
                <InfoItem label="Tên bài" value={displayName} wide />
                <InfoItem label="Thời lượng" value={upload.duration || '--:--'} />
                <InfoItem label="Dung lượng" value={`${formatSize(upload)} MB`} />
                <InfoItem label="Định dạng" value={upload.format || fileFormat(displayName)} />
              </div>
            </div>
            <div className="compact-section">
              <div className="section-title">
                <span>Phân tích âm nhạc</span>
                {analysisBusy && (
                  <span className="inline-loading">
                    <LoaderCircle className="spin" size={15} />
                    Đang phân tích...
                  </span>
                )}
              </div>
              {analysisError && (
                <div className="analysis-warning">
                  <CircleAlert size={16} />
                  <span>{analysisError}</span>
                </div>
              )}
              <div className="analysis-grid">
                <Metric label="BPM" value={analysis?.bpm || '--'} />
                <Metric label="Key / Tone" value={analysis?.key || '--'} />
                <Metric label="Mode" value={analysis?.mode || '--'} />
                <Metric label="Hợp âm gợi ý" value={analysis?.chords?.length ? analysis.chords.join(' - ') : '--'} wide />
              </div>
            </div>
            <div className="action-row">
              <button className="primary-action" disabled={!canUseFile} onClick={separateAll}>
                {processing ? <LoaderCircle className="spin" size={18} /> : <Waves size={18} />}
                <span>Tách tất cả</span>
              </button>
              <button className="secondary-action" disabled={!canUseFile || analysisBusy} onClick={() => analyzeFile(upload, { force: true })}>
                <RefreshCw size={17} />
                <span>Phân tích lại</span>
              </button>
              <button className="secondary-action" disabled={uploadBusy || processing} onClick={deleteFile}>
                <Trash2 size={17} />
                <span>Xóa file</span>
              </button>
            </div>
          </section>
        )}

        {progress && <ProgressCard progress={progress} complete={Boolean(result)} />}
        {result && (
          <section className="stems-card">
            <div className="section-title">Kết quả tách nhạc</div>
            <div className="stem-list">
              {sortedFiles.map((file) => (
                <div className="stem-row" key={file.type}>
                  <strong>{stemLabels[file.type] || file.type}</strong>
                  <div className="stem-actions">
                    <a className="preview-link" href={backendAssetUrl(file.url)} target="_blank" rel="noreferrer">
                      <Play size={15} />
                      <span>Nghe thử</span>
                    </a>
                    <a className="download-link" href={backendAssetUrl(file.downloadUrl || file.url)}>
                      <Download size={15} />
                      <span>Tải xuống</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </section>
    );
  }

  function renderDownloader() {
    return (
      <section className="downloader-view tool-view">
        <div className="tool-heading">
          <span className="hero-kicker">DOWNLOADER</span>
          <h1>AioLab Downloader</h1>
          <p>Dán YouTube, SoundCloud hoặc X link để tải MP3/MP4 và gửi vào Audio Tools.</p>
        </div>
        <form className="downloader-form" onSubmit={checkDownloaderLink}>
          <input value={downloaderUrl} onChange={(event) => setDownloaderUrl(event.target.value)} placeholder="Paste YouTube, SoundCloud or X link..." />
          <button className="primary-action" type="submit" disabled={!downloaderUrl.trim() || downloaderBusy}>
            {downloaderBusy && downloaderProgress?.text === 'Đang kiểm tra link...' ? <LoaderCircle className="spin" size={18} /> : <FileDown size={18} />}
            <span>Check Link</span>
          </button>
        </form>
        {downloaderError && (
          <div className="analysis-warning downloader-error">
            <CircleAlert size={16} />
            <span>{downloaderError}</span>
          </div>
        )}
        {downloaderProgress && <ProgressCard progress={downloaderProgress} complete={Boolean(downloaderResult)} />}
        {downloaderInfo && (
          <section className="downloader-card">
            {downloaderInfo.thumbnail ? <img src={backendAssetUrl(downloaderInfo.thumbnail)} alt="" /> : <div className="thumbnail-empty"><FileDown size={30} /></div>}
            <div className="download-meta">
              <span>{downloaderInfo.platform} • {downloaderInfo.type}</span>
              <h2>{downloaderInfo.title}</h2>
              <p>{downloaderInfo.uploader || 'Unknown uploader'}</p>
              <div className="download-facts">
                <strong>{downloaderInfo.duration}</strong>
                {downloaderInfo.itemCount && <strong>{downloaderInfo.itemCount} items</strong>}
              </div>
            </div>
          </section>
        )}
        {downloaderInfo && (
          <div className="action-row">
            {downloaderFormats.includes('mp3') && <button className="primary-action" type="button" disabled={downloaderBusy} onClick={() => downloadMedia('mp3')}><Download size={17} /><span>Download MP3 - Best Quality</span></button>}
            {downloaderFormats.includes('mp4') && <button className="secondary-action" type="button" disabled={downloaderBusy} onClick={() => downloadMedia('mp4')}><Download size={17} /><span>Download MP4 - Best Quality</span></button>}
            {downloaderInfo.platform === 'soundcloud' && <button className="secondary-action" type="button" onClick={useInAudioTools}><Waves size={17} /><span>Send to Audio Tools</span></button>}
          </div>
        )}
        {downloaderResult && (
          <section className="download-result-card">
            <div>
              <span>Hoàn tất</span>
              <strong>{downloaderResult.title}</strong>
              <p>{downloaderResult.format.toUpperCase()} • {downloaderResult.sizeMB} MB • hết hạn sau {downloaderResult.expiresInMinutes} phút</p>
            </div>
            <div className="stem-actions">
              <a className="download-link" href={backendAssetUrl(downloaderResult.downloadUrl)}><Download size={15} /><span>Download File</span></a>
              {downloaderResult.format === 'mp3' && <button className="secondary-action" type="button" onClick={useInAudioTools}><Waves size={15} /><span>Use in Audio Tools</span></button>}
            </div>
          </section>
        )}
      </section>
    );
  }

  function renderVideoTools() {
    return (
      <section className="video-extract-view tool-view">
        <div className="tool-heading">
          <span className="hero-kicker">VIDEO TOOLS</span>
          <h1>Extract Audio</h1>
          <p>Upload video MP4, MKV, MOV, WEBM hoặc AVI để xuất MP3, WAV hoặc M4A bằng FFmpeg.</p>
        </div>

        <section
          className={`video-drop-zone ${videoExtractFile ? 'has-file' : ''}`}
          onClick={() => videoExtractInputRef.current?.click()}
          onDrop={(event) => {
            event.preventDefault();
            handleVideoExtractFile(event.dataTransfer.files?.[0]);
          }}
          onDragOver={(event) => event.preventDefault()}
        >
          <Upload size={24} />
          <strong>Kéo thả video hoặc bấm để chọn file</strong>
          <span>MP4, MKV, MOV, WEBM, AVI. Tối đa 100MB.</span>
          <input
            ref={videoExtractInputRef}
            className="file-input"
            type="file"
            accept=".mp4,.mkv,.mov,.webm,.avi,video/mp4,video/x-matroska,video/quicktime,video/webm,video/x-msvideo"
            onChange={(event) => handleVideoExtractFile(event.target.files?.[0])}
          />
        </section>

        {videoExtractError && (
          <div className="analysis-warning downloader-error video-extract-error">
            <CircleAlert size={16} />
            <span>{videoExtractError}</span>
          </div>
        )}

        {videoExtractFile && (
          <section className="workspace-card video-extract-card">
            <div className="section-title">Extract Audio</div>
            <div className="info-grid">
              <InfoItem label="Tên file" value={videoExtractFile.name} wide />
              <InfoItem label="Dung lượng" value={`${videoExtractFile.sizeMB} MB`} />
              <InfoItem label="Thời lượng" value={formatVideoDuration(videoExtractFile.duration)} />
            </div>

            <div className="format-picker" aria-label="Audio output format">
              {['mp3', 'wav', 'm4a'].map((format) => (
                <button
                  key={format}
                  className={videoExtractFormat === format ? 'active' : ''}
                  type="button"
                  onClick={() => setVideoExtractFormat(format)}
                  disabled={videoExtractBusy}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="action-row">
              <button className="primary-action" type="button" disabled={videoExtractBusy} onClick={extractAudio}>
                {videoExtractBusy ? <LoaderCircle className="spin" size={18} /> : <FileDown size={18} />}
                <span>Extract Audio</span>
              </button>
            </div>
          </section>
        )}

        {videoExtractProgress && (
          <ProgressCard progress={videoExtractProgress} complete={Boolean(videoExtractResult)} />
        )}

        {videoExtractResult && (
          <section className="download-result-card audio-ready-card">
            <div>
              <span>Audio Ready</span>
              <strong>{videoExtractResult.filename}</strong>
              <p>{videoExtractFormat.toUpperCase()} • Completed</p>
            </div>
            <div className="stem-actions">
              <a className="download-link" href={backendAssetUrl(videoExtractResult.downloadUrl)}>
                <Download size={15} />
                <span>Download</span>
              </a>
            </div>
          </section>
        )}
      </section>
    );
  }

  function renderToolPlaceholder(title, description, tools) {
    return (
      <section className="tool-view">
        <div className="tool-heading">
          <span className="hero-kicker">AIOLAB TOOL</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {routedAsset && activeView === routedAsset.kind && (
          <div className="routed-card">
            <span>Input detected</span>
            <strong>{routedAsset.name}</strong>
            <p>{routedAsset.sizeMB} MB • {routedAsset.mimeType || routedAsset.extension}</p>
          </div>
        )}
        <div className="tool-grid">
          {tools.map((tool) => <span key={tool}>{tool}</span>)}
        </div>
      </section>
    );
  }

  function renderAiView() {
    return (
      <section className="ai-view">
        {renderAssistantNotice()}
        {renderDisabledChatComposer('ai-page-composer')}
      </section>
    );
  }

  function renderChat() {
    return (
      <motion.aside
        className="chat-popup"
        initial={{ opacity: 0, y: 18, scale: 0.96, filter: 'blur(7px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: 14, scale: 0.97, filter: 'blur(7px)' }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="chat-header">
          <div><strong>AioLab Assistant</strong><span>Chatbot</span></div>
          <button type="button" onClick={() => setChatOpen(false)} title="Đóng chat"><X size={18} /></button>
        </header>
        <div className="chat-dev-body">
          {renderAssistantNotice()}
        </div>
        {renderDisabledChatComposer()}
      </motion.aside>
    );
  }

  function renderAssistantNotice() {
    return (
      <section className="ai-dev-card">
        <div className="ai-dev-icon"><Bot size={30} /></div>
        <div className="ai-dev-copy">
          <h2>🤖 AioLab Assistant</h2>
          <p>Hiện tại ChatBot vẫn đang trong quá trình phát triển và hoàn thiện.</p>
          <p>Một số tính năng AI như:</p>
          <ul>
            <li>Phân tích âm nhạc</li>
            <li>Gợi ý hợp âm</li>
            <li>Hỗ trợ mix/master</li>
            <li>Phân tích tài liệu</li>
            <li>Hỗ trợ hình ảnh</li>
          </ul>
          <p>sẽ được cập nhật trong các phiên bản tiếp theo.</p>
          <p>AioLab được phát triển bởi:</p>
          <strong>Lê Minh Khôi</strong>
          <div className="ai-contact">
            <span>📞 0393338079</span>
            <span>📧 khoidangdihoc1212@gmail.com</span>
          </div>
          <p>Nếu có góp ý hoặc báo lỗi vui lòng liên hệ trực tiếp.</p>
          <div className="ai-contact-actions">
            <a href="tel:0393338079"><Phone size={16} />Gọi điện</a>
            <a href="mailto:khoidangdihoc1212@gmail.com"><Mail size={16} />Gửi Email</a>
          </div>
        </div>
      </section>
    );
  }

  function renderDisabledChatComposer(extraClass = '') {
    return (
      <form className={`composer disabled-composer ${extraClass}`} onSubmit={(event) => event.preventDefault()}>
        <textarea
          value=""
          placeholder="ChatBot đang được phát triển..."
          rows={1}
          disabled
          title="Tính năng sẽ sớm được cập nhật"
        />
        <button type="submit" disabled title="Tính năng sẽ sớm được cập nhật">
          <Send size={18} />
        </button>
      </form>
    );
  }
}

function ProgressCard({ progress, complete }) {
  return (
    <section className={`progress-card ${progress.error ? 'error' : ''} ${complete ? 'complete' : ''}`}>
      <div className="progress-top"><span>{progress.text}</span><strong>{progress.percent}%</strong></div>
      <div className="progress-track"><div style={{ width: `${progress.percent}%` }} /></div>
    </section>
  );
}

function InfoItem({ label, value, wide = false }) {
  return <div className={`info-item ${wide ? 'wide' : ''}`}><span>{label}</span><strong title={String(value || '')}>{value || '--'}</strong></div>;
}

function Metric({ label, value, wide = false }) {
  return <div className={`metric ${wide ? 'wide' : ''}`}><span>{label}</span><strong title={String(value || '')}>{value || '--'}</strong></div>;
}

function normalizeUploadedFile(data) {
  if (data.file) return { ...data.file, fileName: data.file.storedName, url: backendAssetUrl(data.file.url || data.url) };
  return {
    fileName: data.fileName,
    storedName: data.storedName || data.fileName,
    originalName: data.originalName || data.displayName,
    displayName: data.displayName || data.originalName,
    size: data.size,
    sizeMB: data.size ? Number((data.size / 1024 / 1024).toFixed(2)) : data.sizeMB,
    format: data.format || fileFormat(data.originalName || data.displayName),
    url: backendAssetUrl(data.url),
    status: 'Đã upload'
  };
}

function formatSize(file) {
  if (typeof file?.sizeMB === 'number') return file.sizeMB.toFixed(2);
  if (typeof file?.size === 'number') return (file.size / 1024 / 1024).toFixed(2);
  return '0.00';
}

function fileFormat(name = '') {
  const ext = String(name).split('.').pop()?.toLowerCase();
  return ext && ext !== name ? ext : 'audio';
}

function detectFileKind(file) {
  const ext = fileFormat(file.name);
  if (['mp3', 'wav', 'flac'].includes(ext) || file.type.startsWith('audio/')) return 'audio';
  if (['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext) || file.type.startsWith('video/')) return 'video';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) || file.type.startsWith('image/')) return 'image';
  if (['pdf', 'doc', 'docx'].includes(ext) || file.type.includes('pdf') || file.type.includes('word')) return 'documents';
  return 'ai';
}

function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video metadata.'));
    };
    video.src = url;
  });
}

function formatVideoDuration(seconds) {
  const total = Math.round(Number(seconds || 0));
  if (!Number.isFinite(total) || total <= 0) return '--:--';

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

function makeRoutedAsset(file, kind) {
  return {
    kind,
    name: file.name,
    sizeMB: (file.size / 1024 / 1024).toFixed(2),
    mimeType: file.type,
    extension: fileFormat(file.name)
  };
}

function detectUrlKind(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return '';
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'spotify.com' || host === 'www.spotify.com' || host === 'open.spotify.com') return 'spotify';
  const supported = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be',
    'soundcloud.com',
    'www.soundcloud.com',
    'x.com',
    'www.x.com',
    'twitter.com',
    'www.twitter.com'
  ].includes(host);
  return supported ? 'downloader' : 'unsupported';
}

function validateDownloaderUrl(value) {
  const kind = detectUrlKind(value);
  if (kind === 'spotify') return SPOTIFY_MESSAGE;
  if (kind === 'unsupported') return UNSUPPORTED_MESSAGE;
  return kind === 'downloader' ? '' : 'URL không hợp lệ.';
}
