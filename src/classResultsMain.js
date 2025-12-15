// 🔗 Firebase SDK에서 필요한 함수들 가져오기
import { getFirestore, doc, getDoc, collection, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { marked } from 'marked';
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebaseConfig.js";
import Swal from 'sweetalert2';
import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';

// 🔧 DOM 요소 참조
const userSelect = document.getElementById("user-select");
const dateCheckboxes = document.getElementById("date-checkboxes");
const resultsContainer = document.getElementById("results-container");

let allUsers = [];
let selectedScenarioId = null; // 관리자가 선택한 현재 시나리오 ID
let todayString = new Date().toISOString().split("T")[0];

// 🔐 로그인 확인 (모든 로그인 사용자 허용)
document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      initResultsPage();
    } else {
      Swal.fire({
        icon: 'error',
        title: '로그인 필요',
        text: '로그인이 필요합니다.'
      }).then(() => window.location.href = "/");
    }
  });
});

// 🔄 결과 페이지 초기화
async function initResultsPage() {
  // 관리자가 선택한 현재 시나리오 ID 가져오기
  await loadSelectedScenario();
  
  // 이벤트 리스너 등록
  userSelect.addEventListener("change", filterAndRender);

  // 스크롤 탑 버튼 생성
  createScrollTopButton();

  // 초기 데이터 로드
  await loadAllDocuments();
  
  // 초기 필터링 및 렌더링
  filterAndRender();
}

// 🎛️ 스크롤 탑 버튼 생성
function createScrollTopButton() {
  const scrollTopBtn = document.createElement('button');
  scrollTopBtn.id = 'scroll-top-btn';
  scrollTopBtn.innerHTML = '⬆️';
  scrollTopBtn.title = '맨 위로 이동';
  
  Object.assign(scrollTopBtn.style, {
    position: 'fixed',
    bottom: '30px',
    right: '30px',
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    zIndex: '1000',
    opacity: '0',
    visibility: 'hidden',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
  });
  
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
  
  scrollTopBtn.addEventListener('mouseenter', () => {
    scrollTopBtn.style.backgroundColor = '#059669';
    scrollTopBtn.style.transform = 'scale(1.1)';
  });
  
  scrollTopBtn.addEventListener('mouseleave', () => {
    scrollTopBtn.style.backgroundColor = '#10b981';
    scrollTopBtn.style.transform = 'scale(1)';
  });
  
  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
      scrollTopBtn.style.opacity = '1';
      scrollTopBtn.style.visibility = 'visible';
    } else {
      scrollTopBtn.style.opacity = '0';
      scrollTopBtn.style.visibility = 'hidden';
    }
  });
  
  document.body.appendChild(scrollTopBtn);
}

// 🔍 관리자가 선택한 현재 시나리오 ID 로드
async function loadSelectedScenario() {
  try {
    const configDoc = await getDoc(doc(db, "lessonPlayScenarios", "config"));
    if (configDoc.exists()) {
      selectedScenarioId = configDoc.data().selectedScenarioId || null;
      console.log("선택된 시나리오 ID:", selectedScenarioId);
    } else {
      console.warn("시나리오 config 문서를 찾을 수 없습니다.");
    }
  } catch (error) {
    console.error("시나리오 로드 실패:", error);
  }
}

// 🔍 Firestore에서 모든 문서 로드 및 정렬
async function loadAllDocuments() {
  const snapshot = await getDocs(collection(db, "lessonPlayResponses"));
  const documents = [];
  const userMap = new Map();
  const dateSet = new Set();

  snapshot.forEach(doc => {
    const data = doc.data();
    
    // 문서 ID에서 타입 추출 (lessonPlay 또는 lessonPlayFeedback)
    const docType = doc.id.includes('lessonPlayFeedback') ? 'lessonPlayFeedback' : 
                   doc.id.includes('lessonPlay') ? 'lessonPlay' : null;
    
    // 관리자가 선택한 현재 시나리오만 필터링
    if (data.uid && data.scenarioId && docType && selectedScenarioId && data.scenarioId === selectedScenarioId) {
      const timestamp = data.createdAt?.toDate?.() || data.updatedAt?.toDate?.() || new Date();
      
      const displayTime = timestamp;
      
      let utcTime;
      if (timestamp === data.createdAt?.toDate?.() || timestamp === data.updatedAt?.toDate?.()) {
        utcTime = timestamp;
      } else {
        utcTime = new Date(timestamp.getTime() - (9 * 60 * 60 * 1000));
      }
      
      const koreanTime = new Date(utcTime.getTime() + (9 * 60 * 60 * 1000));
      const year = koreanTime.getFullYear();
      const month = String(koreanTime.getMonth() + 1).padStart(2, '0');
      const day = String(koreanTime.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      documents.push({
        id: doc.id,
        ...data,
        type: docType,
        createdAt: displayTime,
        dateStr: dateStr,
        potentialAnalysis: data.potentialAnalysis || null
      });

      // 선택된 시나리오의 피드백 데이터만 날짜와 사용자 수집
      if (docType === 'lessonPlayFeedback') {
        if (!userMap.has(data.uid)) {
          userMap.set(data.uid, {
            displayName: data.displayName || data.uid,
            email: data.email || ""
          });
        }
        dateSet.add(dateStr);
      }
    }
  });

  // 날짜 내림차순 정렬
  const sortedDates = Array.from(dateSet).sort((a, b) => new Date(b) - new Date(a));
  
  // 사용자 이름순 정렬
  allUsers = Array.from(userMap.entries())
    .map(([uid, { displayName, email }]) => ({ uid, name: displayName, email }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // 날짜 체크박스 구성
  populateDateCheckboxes(sortedDates);
  
  // 사용자 드롭다운 구성
  populateUserDropdown();

  // 캐시 업데이트
  window.cachedDocuments = documents;

  return documents;
}

// 📅 날짜 체크박스 구성
function populateDateCheckboxes(dates) {
  dateCheckboxes.innerHTML = "";
  
  // 전체 선택 체크박스
  const allDatesItem = createDateCheckboxItem("all", "전체 날짜", true);
  const allCheckbox = allDatesItem.querySelector('input[type="checkbox"]');
  allCheckbox.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    dateCheckboxes.querySelectorAll('.date-checkbox-item input[type="checkbox"]').forEach(checkbox => {
      if (checkbox.value !== "all") {
        checkbox.checked = isChecked;
      }
    });
    filterAndRender();
  });
  dateCheckboxes.appendChild(allDatesItem);

  // 개별 날짜 체크박스들
  dates.forEach(date => {
    const [year, month, day] = date.split('-');
    const displayDate = `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`;
    
    const dateItem = createDateCheckboxItem(date, displayDate, false);
    const dateCheckbox = dateItem.querySelector('input[type="checkbox"]');
    dateCheckbox.addEventListener("change", () => {
      updateAllDatesCheckbox();
      filterAndRender();
    });
    dateCheckboxes.appendChild(dateItem);
  });
}

// 📅 날짜 체크박스 아이템 생성
function createDateCheckboxItem(value, label, isChecked) {
  const container = document.createElement("div");
  container.classList.add("date-checkbox-item");
  
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = value;
  checkbox.checked = isChecked;
  checkbox.id = `date-checkbox-${value}`;
  
  const checkmark = document.createElement("span");
  checkmark.classList.add("checkmark-small");
  
  const dateLabel = document.createElement("span");
  dateLabel.classList.add("date-label");
  dateLabel.textContent = label;
  
  const labelElement = document.createElement("label");
  labelElement.setAttribute("for", checkbox.id);
  labelElement.appendChild(checkmark);
  labelElement.appendChild(dateLabel);
  
  container.appendChild(checkbox);
  container.appendChild(labelElement);
  
  return container;
}

// 📅 전체 날짜 체크박스 상태 업데이트
function updateAllDatesCheckbox() {
  const allCheckbox = dateCheckboxes.querySelector('input[value="all"]');
  const individualCheckboxes = dateCheckboxes.querySelectorAll('input[type="checkbox"]:not([value="all"])');
  const allChecked = Array.from(individualCheckboxes).every(cb => cb.checked);
  
  allCheckbox.checked = allChecked;
}


// 👤 사용자 드롭다운 구성
function populateUserDropdown() {
  userSelect.innerHTML = "";
  
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "전체 사용자 보기";
  userSelect.appendChild(allOption);

  allUsers.forEach(user => {
    const option = document.createElement("option");
    option.value = user.uid;
    option.textContent = `${user.name}${user.email ? ` (${user.email})` : ""}`;
    userSelect.appendChild(option);
  });
}

// 👤 필터링된 사용자 드롭다운 업데이트
function updateUserDropdown(filteredUsers) {
  const currentSelection = userSelect.value;
  
  userSelect.innerHTML = "";
  
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "전체 사용자 보기";
  userSelect.appendChild(allOption);

  filteredUsers.forEach(user => {
    const option = document.createElement("option");
    option.value = user.uid;
    option.textContent = `${user.name}${user.email ? ` (${user.email})` : ""}`;
    userSelect.appendChild(option);
  });

  const optionExists = Array.from(userSelect.options).some(option => option.value === currentSelection);
  if (!optionExists) {
    userSelect.value = "all";
  }
}

// 🔍 선택된 조건으로 결과 필터링 및 렌더링
async function filterAndRender() {
  const uid = userSelect.value;
  
  // 선택된 날짜들 가져오기
  const selectedDates = Array.from(dateCheckboxes.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.value)
    .filter(value => value !== "all");

  const allDatesChecked = dateCheckboxes.querySelector('input[value="all"]')?.checked || false;
  
  resultsContainer.innerHTML = "";

  // 모든 문서 로드 (캐시된 데이터 사용)
  let allDocuments = [];
  try {
    if (window.cachedDocuments && window.cachedDocuments.length > 0) {
      allDocuments = window.cachedDocuments;
    } else {
      allDocuments = await loadAllDocuments();
      window.cachedDocuments = allDocuments;
    }
  } catch (error) {
    console.error("문서 로드 실패:", error);
    return;
  }
  
  // 필터링
  let filteredDocs = allDocuments.filter(doc => {
    // 관리자가 선택한 현재 시나리오만 필터 (이미 loadAllDocuments에서 필터링됨, 하지만 안전을 위해)
    if (selectedScenarioId && doc.scenarioId !== selectedScenarioId) return false;
    
    // 날짜 필터
    if (!allDatesChecked && selectedDates.length === 0) return false;
    if (!allDatesChecked && selectedDates.length > 0 && !selectedDates.includes(doc.dateStr)) return false;
    
    // 사용자 필터
    if (uid !== "all" && doc.uid !== uid) return false;
    
    // 피드백이 있는 대화만 표시 (항상 적용)
    if (doc.type !== 'lessonPlayFeedback') return false;
    
    return true;
  });

  // 날짜 내림차순, 사용자 이름 오름차순, 시간 내림차순 정렬
  filteredDocs.sort((a, b) => {
    if (b.dateStr !== a.dateStr) {
      return new Date(b.dateStr) - new Date(a.dateStr);
    }
    
    const userA = allUsers.find(u => u.uid === a.uid)?.name || '';
    const userB = allUsers.find(u => u.uid === b.uid)?.name || '';
    if (userA !== userB) {
      return userA.localeCompare(userB, 'ko');
    }
    
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  // 필터링된 사용자 목록 생성 및 드롭다운 업데이트
  const filteredUsers = [];
  const userMap = new Map();
  
  filteredDocs.forEach(doc => {
    if (!userMap.has(doc.uid)) {
      const user = allUsers.find(u => u.uid === doc.uid);
      if (user) {
        filteredUsers.push(user);
        userMap.set(doc.uid, user);
      }
    }
  });
  
  filteredUsers.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  updateUserDropdown(filteredUsers);

  // 결과 렌더링
  filteredDocs.forEach(doc => {
    const user = allUsers.find(u => u.uid === doc.uid);
    const resultCard = renderResultCard(doc, user);
    resultsContainer.appendChild(resultCard);
  });
  
  // 다운로드 버튼 추가
  addDownloadButtons(filteredDocs);
}

// 🧩 결과 카드 생성 (토글 가능한 형태)
function renderResultCard(doc, user) {
  const card = document.createElement("div");
  card.classList.add("result-card");

  // 헤더 (제목 + 토글 아이콘)
  const header = document.createElement("div");
  header.classList.add("result-header");
  header.onclick = () => toggleResultCard(card);

  const title = document.createElement("div");
  title.classList.add("result-title");
  
  const displayDateTime = doc.createdAt.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const typeText = doc.type === 'lessonPlayFeedback' ? ' (피드백)' : '';
  title.textContent = `${user?.name || '알 수 없음'} (${displayDateTime})${typeText}`;

  const toggleIcon = document.createElement("span");
  toggleIcon.classList.add("result-toggle-icon");
  toggleIcon.textContent = "▼";

  header.appendChild(title);
  header.appendChild(toggleIcon);

  // 내용 (접혀있음)
  const content = document.createElement("div");
  content.classList.add("result-content");

  // 2열 레이아웃 생성
  const columnsContainer = document.createElement("div");
  columnsContainer.classList.add("results-columns");

  // 왼쪽 컬럼: 대화 내용
  const leftColumn = document.createElement("div");
  leftColumn.classList.add("results-column");
  
  const leftTitle = document.createElement("h3");
  leftTitle.textContent = "대화 내용";
  leftColumn.appendChild(leftTitle);

  // Handsontable 컨테이너 생성
  const tableContainer = document.createElement("div");
  tableContainer.id = `result-table-${doc.id}`;
  tableContainer.style.width = "100%";
  tableContainer.style.marginTop = "1rem";
  
  // Handsontable 데이터 준비
  const hasAnalysis = doc.potentialAnalysis && Array.isArray(doc.potentialAnalysis) && doc.potentialAnalysis.length > 0;
  const hasTeacherSpeech = Array.isArray(doc.conversation) && doc.conversation.some(e => e.speaker === '교사');
  const useFourColumns = hasAnalysis && hasTeacherSpeech;
  
  let tableData = [];
  if (Array.isArray(doc.conversation)) {
    tableData = doc.conversation.map(entry => {
      // potentialAnalysis에서 해당 발화 찾기
      let tmssr = '';
      let potential = '';
      
      if (useFourColumns && entry.speaker === '교사') {
        const matchedDecision = doc.potentialAnalysis.find(d => 
          d.speaker === entry.speaker && 
          d.message === entry.message
        );
        if (matchedDecision) {
          tmssr = matchedDecision.tmssr || '';
          potential = matchedDecision.potential || '';
        }
      }
      
      // 모든 행이 같은 컬럼 수를 가져야 함
      if (useFourColumns) {
        return [entry.speaker, entry.message, tmssr, potential];
      } else {
        return [entry.speaker, entry.message];
      }
    });
  } else {
    tableData = [['', '']];
  }
  
  // 컬럼 헤더 설정
  const colHeaders = useFourColumns
    ? ['발화자', '대화', 'TMSSR', 'Potential']
    : ['발화자', '대화'];
  
  // Handsontable 생성 (비동기로 처리)
  setTimeout(() => {
    const hot = new Handsontable(tableContainer, {
      data: tableData,
      colHeaders: colHeaders,
      rowHeaders: true,
      readOnly: true, // 읽기 전용
      colWidths: useFourColumns
        ? [120, 300, 120, 100]
        : [120, 300],
      minRows: 1,
      minCols: colHeaders.length,
      licenseKey: 'non-commercial-and-evaluation',
      width: '100%',
      height: 'auto',
      stretchH: 'all',
      autoWrapRow: true,
      autoWrapCol: true,
      autoRowSize: true,
      className: 'saved-conversation-table',
      cells: function(row, col, prop) {
        const cellProperties = {};
        const entry = Array.isArray(doc.conversation) ? doc.conversation[row] : null;
        
        // 사용자 입력 행 스타일
        if (entry && entry.isUser) {
          cellProperties.className = 'user-entry';
        }
        
        // Potential 컬럼 스타일링 (4번째 컬럼, 인덱스 3)
        if (useFourColumns && col === 3 && entry && entry.speaker === '교사') {
          const potentialValue = tableData[row][3];
          if (potentialValue === 'High') {
            cellProperties.className = (cellProperties.className || '') + ' potential-high';
          } else if (potentialValue === 'Low') {
            cellProperties.className = (cellProperties.className || '') + ' potential-low';
          }
        }
        
        return cellProperties;
      }
    });
    
    // Handsontable 인스턴스를 컨테이너에 저장
    tableContainer._hotInstance = hot;
  }, 100);
  
  leftColumn.appendChild(tableContainer);
  columnsContainer.appendChild(leftColumn);
  
  // 오른쪽 컬럼: 피드백이 있는 경우에만 생성
  if (doc.feedback && doc.type === 'lessonPlayFeedback') {
    const rightColumn = document.createElement("div");
    rightColumn.classList.add("results-column");
    
    const rightTitle = document.createElement("h3");
    rightTitle.textContent = "AI 피드백";
    rightColumn.appendChild(rightTitle);

    const feedbackContent = document.createElement("div");
    feedbackContent.classList.add("feedback-preview");
    feedbackContent.innerHTML = marked.parse(doc.feedback);
    rightColumn.appendChild(feedbackContent);
    
    columnsContainer.appendChild(rightColumn);
  }
  content.appendChild(columnsContainer);

  // 버튼 컨테이너
  const buttonContainer = document.createElement("div");
  buttonContainer.style.marginTop = "16px";
  buttonContainer.style.display = "flex";
  buttonContainer.style.gap = "10px";
  buttonContainer.style.flexWrap = "wrap";

  // 개별 CSV 다운로드 버튼
  const csvBtn = document.createElement("button");
  csvBtn.textContent = "📊 CSV";
  csvBtn.classList.add("btn", "btn-download");
  csvBtn.style.backgroundColor = "#3b82f6";
  csvBtn.onclick = (e) => {
    e.stopPropagation();
    downloadSingleCSV(doc, user);
  };

  // 개별 이미지 다운로드 버튼
  const imgBtn = document.createElement("button");
  imgBtn.textContent = "🖼️ 이미지";
  imgBtn.classList.add("btn", "btn-download");
  imgBtn.style.backgroundColor = "#10b981";
  imgBtn.onclick = (e) => {
    e.stopPropagation();
    downloadSingleImage(doc, card, user);
  };

  buttonContainer.appendChild(csvBtn);
  buttonContainer.appendChild(imgBtn);
  content.appendChild(buttonContainer);

  card.appendChild(header);
  card.appendChild(content);

  return card;
}

// 🔄 결과 카드 토글
function toggleResultCard(card) {
  const content = card.querySelector(".result-content");
  const toggleIcon = card.querySelector(".result-toggle-icon");
  
  if (content.classList.contains("show")) {
    content.classList.remove("show");
    toggleIcon.textContent = "▼";
  } else {
    content.classList.add("show");
    toggleIcon.textContent = "▲";
  }
}

// 📥 다운로드 버튼 추가
function addDownloadButtons(filteredDocs) {
  const existingControls = document.querySelector('.download-controls');
  if (existingControls) {
    existingControls.remove();
  }
  
  if (!filteredDocs || filteredDocs.length === 0) {
    return;
  }
  
  const downloadControls = document.createElement('div');
  downloadControls.className = 'download-controls';
  
  // CSV 다운로드 버튼
  const csvBtn = document.createElement('button');
  csvBtn.className = 'btn-download btn-download-csv';
  csvBtn.innerHTML = '📊 CSV 다운로드';
  csvBtn.onclick = () => downloadAsCSV(filteredDocs);
  
  // 개별 CSV 다운로드 버튼
  const individualCsvBtn = document.createElement('button');
  individualCsvBtn.className = 'btn-download btn-download-csv';
  individualCsvBtn.innerHTML = '📊 개별 CSV 다운로드';
  individualCsvBtn.onclick = () => downloadAllAsIndividualCSV(filteredDocs);
  
  // 이미지 다운로드 버튼
  const imgBtn = document.createElement('button');
  imgBtn.className = 'btn-download';
  imgBtn.innerHTML = '🖼️ 이미지 다운로드';
  imgBtn.onclick = () => downloadAsImage(filteredDocs);
  
  // 개별 이미지 다운로드 버튼
  const individualImgBtn = document.createElement('button');
  individualImgBtn.className = 'btn-download';
  individualImgBtn.innerHTML = '🖼️ 개별 이미지 다운로드';
  individualImgBtn.onclick = () => downloadAllAsIndividualImages(filteredDocs);
  
  downloadControls.appendChild(csvBtn);
  downloadControls.appendChild(individualCsvBtn);
  downloadControls.appendChild(imgBtn);
  downloadControls.appendChild(individualImgBtn);
  
  const resultsContainer = document.getElementById('results-container');
  resultsContainer.parentNode.insertBefore(downloadControls, resultsContainer);
}

// 📊 CSV 다운로드
function downloadAsCSV(filteredDocs) {
  let csvContent = '';
  
  // 모든 문서를 확인하여 potentialAnalysis가 있는 문서가 있는지 확인
  const hasAnyAnalysis = filteredDocs.some(doc => {
    const hasAnalysis = doc.potentialAnalysis && Array.isArray(doc.potentialAnalysis) && doc.potentialAnalysis.length > 0;
    const hasTeacherSpeech = Array.isArray(doc.conversation) && doc.conversation.some(e => e.speaker === '교사');
    return hasAnalysis && hasTeacherSpeech;
  });
  
  const hasAnyFeedback = filteredDocs.some(doc => doc.type === 'lessonPlayFeedback');
  
  // 헤더 생성 (첫 번째 문서 기준)
  if (hasAnyFeedback) {
    if (hasAnyAnalysis) {
      csvContent += '사용자,날짜/시간,화자,메시지,TMSSR,Potential,AI 피드백\n';
    } else {
      csvContent += '사용자,날짜/시간,화자,메시지,AI 피드백\n';
    }
  } else {
    if (hasAnyAnalysis) {
      csvContent += '사용자,날짜/시간,화자,메시지,TMSSR,Potential\n';
    } else {
      csvContent += '사용자,날짜/시간,화자,메시지\n';
    }
  }
  
  filteredDocs.forEach((doc, index) => {
    const user = allUsers.find(u => u.uid === doc.uid);
    const userName = user?.name || '알 수 없음';
    const dateTime = doc.createdAt.toLocaleString('ko-KR');
    
    // 각 문서의 potentialAnalysis 확인
    const hasAnalysis = doc.potentialAnalysis && Array.isArray(doc.potentialAnalysis) && doc.potentialAnalysis.length > 0;
    const hasTeacherSpeech = Array.isArray(doc.conversation) && doc.conversation.some(e => e.speaker === '교사');
    const useFourColumns = hasAnalysis && hasTeacherSpeech;
    
    if (Array.isArray(doc.conversation)) {
      doc.conversation.forEach((entry, convIndex) => {
        const row = [
          `"${userName}"`,
          `"${dateTime}"`,
          `"${entry.speaker}"`,
          `"${entry.message.replace(/"/g, '""')}"`
        ];
        
        // TMSSR과 Potential 정보 추가 (헤더에 포함되어 있으면)
        if (hasAnyAnalysis) {
          let tmssr = '';
          let potential = '';
          
          if (useFourColumns && entry.speaker === '교사') {
            const matchedDecision = doc.potentialAnalysis.find(d => 
              d.speaker === entry.speaker && 
              d.message === entry.message
            );
            if (matchedDecision) {
              tmssr = matchedDecision.tmssr || '';
              potential = matchedDecision.potential || '';
            }
          }
          
          row.push(`"${tmssr}"`);
          row.push(`"${potential}"`);
        }
        
        // AI 피드백 추가
        if (hasAnyFeedback && doc.type === 'lessonPlayFeedback' && convIndex === 0) {
          row.push(`"${doc.feedback.replace(/"/g, '""')}"`);
        } else if (hasAnyFeedback && doc.type === 'lessonPlayFeedback') {
          row.push('""');
        }
        
        csvContent += row.join(',') + '\n';
      });
    }
    
    csvContent += '\n';
  });
  
  const BOM = '\uFEFF';
  const csvWithBOM = BOM + csvContent;
  
  const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `친구들_결과_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 📊 단일 문서 CSV 다운로드
function downloadSingleCSV(doc, user) {
  const userName = user?.name || '알 수 없음';
  const dateTime = doc.createdAt.toLocaleString('ko-KR');
  
  // potentialAnalysis가 있는지 확인
  const hasAnalysis = doc.potentialAnalysis && Array.isArray(doc.potentialAnalysis) && doc.potentialAnalysis.length > 0;
  const hasTeacherSpeech = Array.isArray(doc.conversation) && doc.conversation.some(e => e.speaker === '교사');
  const useFourColumns = hasAnalysis && hasTeacherSpeech;
  
  let csvContent = '';
  
  // 헤더 생성
  if (doc.type === 'lessonPlayFeedback') {
    if (useFourColumns) {
      csvContent += '사용자,날짜/시간,화자,메시지,TMSSR,Potential,AI 피드백\n';
    } else {
      csvContent += '사용자,날짜/시간,화자,메시지,AI 피드백\n';
    }
  } else {
    if (useFourColumns) {
      csvContent += '사용자,날짜/시간,화자,메시지,TMSSR,Potential\n';
    } else {
      csvContent += '사용자,날짜/시간,화자,메시지\n';
    }
  }
  
  if (Array.isArray(doc.conversation)) {
    doc.conversation.forEach((entry, convIndex) => {
      const row = [
        `"${userName}"`,
        `"${dateTime}"`,
        `"${entry.speaker}"`,
        `"${entry.message.replace(/"/g, '""')}"`
      ];
      
      // TMSSR과 Potential 정보 추가
      if (useFourColumns) {
        let tmssr = '';
        let potential = '';
        
        if (entry.speaker === '교사') {
          const matchedDecision = doc.potentialAnalysis.find(d => 
            d.speaker === entry.speaker && 
            d.message === entry.message
          );
          if (matchedDecision) {
            tmssr = matchedDecision.tmssr || '';
            potential = matchedDecision.potential || '';
          }
        }
        
        row.push(`"${tmssr}"`);
        row.push(`"${potential}"`);
      }
      
      // AI 피드백 추가
      if (doc.type === 'lessonPlayFeedback' && convIndex === 0) {
        row.push(`"${doc.feedback.replace(/"/g, '""')}"`);
      } else if (doc.type === 'lessonPlayFeedback') {
        row.push('""');
      }
      
      csvContent += row.join(',') + '\n';
    });
  }
  
  const BOM = '\uFEFF';
  const csvWithBOM = BOM + csvContent;
  
  const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${userName}_${dateTime.replace(/[/:]/g, '-')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 🖼️ 단일 문서 이미지 다운로드
async function downloadSingleImage(doc, card, user) {
  try {
    const content = card.querySelector('.result-content');
    if (content && !content.classList.contains('show')) {
      content.classList.add('show');
      const toggleIcon = card.querySelector('.result-toggle-icon');
      if (toggleIcon) {
        toggleIcon.textContent = '▲';
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const canvas = await html2canvas(card, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: 0
    });
    
    const userName = user?.name || '알 수 없음';
    const dateTime = doc.createdAt.toLocaleString('ko-KR');
    const link = document.createElement('a');
    link.download = `${userName}_${dateTime.replace(/[/:]/g, '-')}.png`;
    link.href = canvas.toDataURL();
    link.click();
    
    if (content && content.classList.contains('show')) {
      content.classList.remove('show');
      const toggleIcon = card.querySelector('.result-toggle-icon');
      if (toggleIcon) {
        toggleIcon.textContent = '▼';
      }
    }
    
  } catch (error) {
    console.error('이미지 다운로드 실패:', error);
    Swal.fire({
      icon: 'error',
      title: '다운로드 실패',
      text: '이미지 다운로드 중 오류가 발생했습니다.'
    });
  }
}

// 📊 모든 문서를 개별 CSV 파일로 다운로드
async function downloadAllAsIndividualCSV(filteredDocs) {
  try {
    const progressModal = Swal.fire({
      title: 'CSV 파일 생성 중...',
      html: `<div id="csv-progress">0 / ${filteredDocs.length} 파일 생성 완료</div>`,
      allowOutsideClick: false,
      showConfirmButton: false
    });
    
    const progressElement = document.getElementById('csv-progress');
    
    for (let i = 0; i < filteredDocs.length; i++) {
      const doc = filteredDocs[i];
      const user = allUsers.find(u => u.uid === doc.uid);
      const userName = user?.name || '알 수 없음';
      const dateTime = doc.createdAt.toLocaleString('ko-KR');
      
      // potentialAnalysis가 있는지 확인
      const hasAnalysis = doc.potentialAnalysis && Array.isArray(doc.potentialAnalysis) && doc.potentialAnalysis.length > 0;
      const hasTeacherSpeech = Array.isArray(doc.conversation) && doc.conversation.some(e => e.speaker === '교사');
      const useFourColumns = hasAnalysis && hasTeacherSpeech;
      
      let csvContent = '';
      
      // 헤더 생성
      if (doc.type === 'lessonPlayFeedback') {
        if (useFourColumns) {
          csvContent += '사용자,날짜/시간,화자,메시지,TMSSR,Potential,AI 피드백\n';
        } else {
          csvContent += '사용자,날짜/시간,화자,메시지,AI 피드백\n';
        }
      } else {
        if (useFourColumns) {
          csvContent += '사용자,날짜/시간,화자,메시지,TMSSR,Potential\n';
        } else {
          csvContent += '사용자,날짜/시간,화자,메시지\n';
        }
      }
      
      if (Array.isArray(doc.conversation)) {
        doc.conversation.forEach((entry, convIndex) => {
          const row = [
            `"${userName}"`,
            `"${dateTime}"`,
            `"${entry.speaker}"`,
            `"${entry.message.replace(/"/g, '""')}"`
          ];
          
          // TMSSR과 Potential 정보 추가
          if (useFourColumns) {
            let tmssr = '';
            let potential = '';
            
            if (entry.speaker === '교사') {
              const matchedDecision = doc.potentialAnalysis.find(d => 
                d.speaker === entry.speaker && 
                d.message === entry.message
              );
              if (matchedDecision) {
                tmssr = matchedDecision.tmssr || '';
                potential = matchedDecision.potential || '';
              }
            }
            
            row.push(`"${tmssr}"`);
            row.push(`"${potential}"`);
          }
          
          // AI 피드백 추가
          if (doc.type === 'lessonPlayFeedback' && convIndex === 0) {
            row.push(`"${doc.feedback.replace(/"/g, '""')}"`);
          } else if (doc.type === 'lessonPlayFeedback') {
            row.push('""');
          }
          
          csvContent += row.join(',') + '\n';
        });
      }
      
      const BOM = '\uFEFF';
      const csvWithBOM = BOM + csvContent;
      
      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${userName}_${dateTime.replace(/[/:]/g, '-')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      progressElement.textContent = `${i + 1} / ${filteredDocs.length} 파일 생성 완료`;
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    progressModal.close();
    Swal.fire({
      icon: 'success',
      title: '다운로드 완료!',
      text: `${filteredDocs.length}개의 CSV 파일이 다운로드되었습니다.`,
      timer: 3000,
      showConfirmButton: false
    });
    
  } catch (error) {
    console.error('개별 CSV 다운로드 실패:', error);
    Swal.fire({
      icon: 'error',
      title: '다운로드 실패',
      text: '개별 CSV 파일 다운로드 중 오류가 발생했습니다.'
    });
  }
}

// 🖼️ 모든 문서를 개별 이미지 파일로 다운로드
async function downloadAllAsIndividualImages(filteredDocs) {
  try {
    const progressModal = Swal.fire({
      title: '이미지 파일 생성 중...',
      html: `<div id="img-progress">0 / ${filteredDocs.length} 파일 생성 완료</div>`,
      allowOutsideClick: false,
      showConfirmButton: false
    });
    
    const progressElement = document.getElementById('img-progress');
    
    const allCards = document.querySelectorAll('.result-card');
    allCards.forEach(card => {
      const content = card.querySelector('.result-content');
      if (content && !content.classList.contains('show')) {
        content.classList.add('show');
        const toggleIcon = card.querySelector('.result-toggle-icon');
        if (toggleIcon) {
          toggleIcon.textContent = '▲';
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    for (let i = 0; i < filteredDocs.length; i++) {
      const doc = filteredDocs[i];
      const card = allCards[i];
      
      if (card) {
        const user = allUsers.find(u => u.uid === doc.uid);
        const userName = user?.name || '알 수 없음';
        const dateTime = doc.createdAt.toLocaleString('ko-KR');
        
        const canvas = await html2canvas(card, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          allowTaint: true,
          scrollX: 0,
          scrollY: 0
        });
        
        const link = document.createElement('a');
        link.download = `${userName}_${dateTime.replace(/[/:]/g, '-')}.png`;
        link.href = canvas.toDataURL();
        link.click();
        
        progressElement.textContent = `${i + 1} / ${filteredDocs.length} 파일 생성 완료`;
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    allCards.forEach(card => {
      const content = card.querySelector('.result-content');
      if (content && content.classList.contains('show')) {
        content.classList.remove('show');
        const toggleIcon = card.querySelector('.result-toggle-icon');
        if (toggleIcon) {
          toggleIcon.textContent = '▼';
        }
      }
    });
    
    progressModal.close();
    Swal.fire({
      icon: 'success',
      title: '다운로드 완료!',
      text: `${filteredDocs.length}개의 이미지 파일이 다운로드되었습니다.`,
      timer: 3000,
      showConfirmButton: false
    });
    
  } catch (error) {
    console.error('개별 이미지 다운로드 실패:', error);
    Swal.fire({
      icon: 'error',
      title: '다운로드 실패',
      text: '개별 이미지 파일 다운로드 중 오류가 발생했습니다.'
    });
  }
}

// 🖼️ 전체 이미지 다운로드
async function downloadAsImage(filteredDocs) {
  try {
    const allCards = document.querySelectorAll('.result-card');
    allCards.forEach(card => {
      const content = card.querySelector('.result-content');
      if (content && !content.classList.contains('show')) {
        content.classList.add('show');
        const toggleIcon = card.querySelector('.result-toggle-icon');
        if (toggleIcon) {
          toggleIcon.textContent = '▲';
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const resultsContainer = document.getElementById('results-container');
    const downloadControls = document.querySelector('.download-controls');
    
    if (downloadControls) {
      downloadControls.style.display = 'none';
    }
    
    const canvas = await html2canvas(resultsContainer, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: 0
    });
    
    if (downloadControls) {
      downloadControls.style.display = 'flex';
    }
    
    const link = document.createElement('a');
    link.download = `친구들_결과_${new Date().toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL();
    link.click();
    
    allCards.forEach(card => {
      const content = card.querySelector('.result-content');
      if (content && content.classList.contains('show')) {
        content.classList.remove('show');
        const toggleIcon = card.querySelector('.result-toggle-icon');
        if (toggleIcon) {
          toggleIcon.textContent = '▼';
        }
      }
    });
    
  } catch (error) {
    console.error('이미지 다운로드 실패:', error);
    Swal.fire({
      icon: 'error',
      title: '다운로드 실패',
      text: '이미지 다운로드 중 오류가 발생했습니다.'
    });
  }
}

