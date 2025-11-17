import './pageLP.css';
import Swal from 'sweetalert2';
import { marked } from 'marked';
import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

let hot; // handsontable 인스턴스
let savedResults = []; // 저장된 결과들 (메모리에만 저장)

document.addEventListener("DOMContentLoaded", () => {
  const feedbackBtn = document.getElementById("feedbackBtn");
  const inputText = document.getElementById("inputText");

  // Handsontable 초기화
  createExcelTable();
  
  // 초기 데이터 렌더링
  renderExcelTable();

  // Potential 판단하기 버튼 이벤트
  const potentialBtn = document.getElementById("potentialBtn");
  if (potentialBtn) {
    potentialBtn.addEventListener("click", async () => {
      await analyzePotential();
    });
  }

  // 피드백 받기 버튼 이벤트 (숨김 처리됨)
  if (feedbackBtn) {
    feedbackBtn.addEventListener("click", async () => {
    const currentData = hot.getData();
    const allConv = [];
    
    // 모든 행 데이터 수집
    for (let i = 0; i < currentData.length; i++) {
      const row = currentData[i];
      if (row[0]?.trim() && row[1]?.trim()) {
        allConv.push({
          speaker: row[0].trim(),
          message: row[1].trim(),
          isUser: i >= baseConversation.length
        });
      }
    }
    
    if (allConv.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "대화 입력 필요",
        text: "대화를 입력해 주세요."
      });
      return;
    }
    
    const conversationText = allConv.map(e => `${e.speaker}: ${e.message}`).join("\n");
    inputText.value = conversationText;

    feedbackBtn.disabled = true;
    document.getElementById("result").innerHTML = "⏳ 피드백 생성 중...";

    try {
      const feedback = await getAssistantFeedback(conversationText);
      document.getElementById("result").innerHTML = marked.parse(feedback);
      
      // MathJax 렌더링 (있는 경우)
      if (window.MathJax) MathJax.typeset();

      // 결과 저장 (메모리에만)
      const timestamp = new Date();
      const result = {
        id: `result_${timestamp.getTime()}`,
        createdAt: timestamp,
        conversation: allConv,
        feedback: feedback
      };
      
      savedResults.unshift(result); // 맨 앞에 추가
      renderSavedResults();

      Swal.fire({
        icon: "success",
        title: "피드백 생성 완료",
        text: "AI 피드백이 생성되었습니다!"
      });

    } catch (err) {
      console.error("피드백 오류:", err);
      document.getElementById("result").textContent = "⚠️ 피드백 생성에 실패했습니다.";
      Swal.fire({
        icon: "error",
        title: "피드백 실패",
        text: err.message || "AI 피드백을 생성하는 데 실패했습니다."
      });
    }
      feedbackBtn.disabled = false;
    });
  }

  // 행 추가/삭제 버튼 이벤트
  document.getElementById('add-row').onclick = () => {
    try {
      hot.alter('insert_row', hot.countRows(), 1);
    } catch (e) {
      try {
        hot.alter('insert_row_below', hot.countRows() - 1, 1);
      } catch (e2) {
        Swal.fire("오류", "행을 추가할 수 없습니다.", "error");
      }
    }
  };
  
  document.getElementById('del-row').onclick = () => {
    const sel = hot.getSelected();
    if (sel && sel.length > 0) {
      const selectedRow = sel[0][0];
      hot.alter('remove_row', selectedRow);
    } else {
      Swal.fire("알림", "삭제할 행을 선택해주세요.", "info");
    }
  };

  // 확장/축소 버튼 이벤트
  document.getElementById('expand-toggle').addEventListener('click', () => {
    const table = document.getElementById('excel-table');
    const button = document.getElementById('expand-toggle');
    
    if (table.classList.contains('expanded')) {
      table.classList.remove('expanded');
      button.textContent = '📏 확장';
      button.classList.remove('expanded');
      button.title = '테이블 확장';
    } else {
      table.classList.add('expanded');
      button.textContent = '📏 축소';
      button.classList.add('expanded');
      button.title = '테이블 축소';
    }
  });

  // CSV 업로드 버튼 이벤트
  document.getElementById('csv-upload-btn').addEventListener('click', () => {
    document.getElementById('csv-upload').click();
  });

  // CSV 파일 업로드 이벤트
  document.getElementById('csv-upload').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      loadCSVFile(file);
    }
  });

  // 프롬프트 정보 버튼 이벤트
  document.getElementById('prompt-info-btn').addEventListener('click', () => {
    showPromptInfo();
  });
});

// Handsontable 생성 함수
function createExcelTable() {
  const container = document.getElementById('excel-table');
  hot = new Handsontable(container, {
    data: [
      ['', '', '', ''],
      ['', '', '', '']
    ], // 빈 데이터 2행으로 시작 (4열)
    colHeaders: ['발화자', '대화', 'TMSSR', 'Potential'],
    rowHeaders: true,
    contextMenu: true,
    colWidths: [100, 250, 120, 120],
    minRows: 2,
    minCols: 4,
    licenseKey: 'non-commercial-and-evaluation',
    width: '100%',
    height: 'auto',
    stretchH: 'all',
    manualRowResize: true,
    manualColumnResize: true,
    autoWrapRow: true,
    autoWrapCol: true,
    autoRowSize: true,
    outsideClickDeselects: false,
    rowHeights: 50,
    className: 'custom-handsontable',
    columns: [
      { data: 0, className: 'htCenter' },
      { data: 1, className: 'htLeft' },
      { data: 2, className: 'htCenter' },
      { data: 3, className: 'htCenter' }
    ]
  });
}

// Handsontable에 데이터 렌더링 (이제 사용하지 않음 - CSV 로드용으로만 사용)
function renderExcelTable() {
  if (!hot) {
    console.log('Handsontable이 아직 초기화되지 않았습니다.');
    return;
  }
  
  hot.render();
}

// 저장된 결과 렌더링
function renderSavedResults() {
  const container = document.getElementById("saved-results-container");
  container.innerHTML = "";

  if (savedResults.length === 0) {
    return;
  }

  const columnsContainer = document.createElement("div");
  columnsContainer.classList.add("results-columns");
  
  const column = document.createElement("div");
  column.classList.add("results-column", "feedback-column");
  column.innerHTML = `<h3 class="column-title">📝 저장된 피드백</h3><div class="column-content"></div>`;
  
  const content = column.querySelector(".column-content");
  savedResults.forEach(result => {
    content.appendChild(renderSavedResult(result));
  });
  
  columnsContainer.appendChild(column);
  container.appendChild(columnsContainer);
}

// 카드로 저장 결과 출력
function renderSavedResult({ id, createdAt, conversation, feedback }) {
  const box = document.createElement("div");
  box.classList.add("saved-result", "result-feedback");
  box.setAttribute("data-id", id);

  const header = document.createElement("div");
  header.classList.add("saved-header");
  header.innerHTML = `<span class="header-text" onclick="toggleResult(this)">📝 ${createdAt.toLocaleString('ko-KR')} 피드백 ▶</span>`;

  const loadBtn = document.createElement("button");
  loadBtn.classList.add("load-btn");
  loadBtn.textContent = "불러오기";
  loadBtn.onclick = () => loadSavedResult(conversation);
  
  const delBtn = document.createElement("button");
  delBtn.classList.add("delete-btn");
  delBtn.textContent = "삭제";
  delBtn.onclick = () => deleteSavedResult(id);
  
  header.appendChild(loadBtn);
  header.appendChild(delBtn);
  box.appendChild(header);

  const contentDiv = document.createElement("div");
  contentDiv.classList.add("result-content");
  contentDiv.style.display = "none";

  const conversationTable = document.createElement("div");
  conversationTable.classList.add("conversation-table");
  
  conversation.forEach(entry => {
    const row = document.createElement("div");
    row.classList.add("conversation-row");
    if (entry.isUser) row.classList.add("user-entry");
    
    const speaker = document.createElement("span");
    speaker.classList.add("speaker");
    speaker.textContent = entry.speaker;
    
    const message = document.createElement("span");
    message.classList.add("message");
    message.textContent = entry.message;
    
    row.appendChild(speaker);
    row.appendChild(message);
    conversationTable.appendChild(row);
  });
  
  contentDiv.appendChild(conversationTable);

  if (feedback) {
    const feedbackBox = document.createElement("div");
    feedbackBox.classList.add("feedback-area");
    feedbackBox.innerHTML = marked.parse(feedback);
    
    const downloadControls = document.createElement("div");
    downloadControls.classList.add("download-controls");
    downloadControls.innerHTML = `
      <button class="download-btn" onclick="downloadFeedbackAsImage(this)">🖼️ 이미지</button>
      <button class="download-btn" onclick="downloadFeedbackAsPdf(this)">📄 PDF</button>
    `;
    
    contentDiv.appendChild(feedbackBox);
    contentDiv.appendChild(downloadControls);
  }

  box.appendChild(contentDiv);
  return box;
}

// 저장된 결과 불러오기
function loadSavedResult(conversation) {
  try {
    const allData = [];
    
    conversation.forEach(entry => {
      allData.push([
        entry.speaker, 
        entry.message,
        entry.tmssr || '',
        entry.potential || ''
      ]);
    });
    
    if (allData.length < 2) {
      allData.push(['', '', '', '']);
    }
    
    hot.loadData(allData);
    hot.render();
    
    Swal.fire({
      icon: "success",
      title: "불러오기 완료",
      text: "저장된 대화문이 입력창에 불러와졌습니다!",
      timer: 2000,
      showConfirmButton: false
    });
    
  } catch (error) {
    console.error("불러오기 실패:", error);
    Swal.fire({
      icon: "error",
      title: "불러오기 실패",
      text: "대화문을 불러오는 중 오류가 발생했습니다."
    });
  }
}

// 결과 카드 토글
window.toggleResult = function(headerElement) {
  const resultCard = headerElement.closest('.saved-result');
  const content = resultCard.querySelector('.result-content');
  const isExpanded = content.style.display !== 'none';
  
  if (isExpanded) {
    content.style.display = 'none';
    headerElement.innerHTML = headerElement.innerHTML.replace(' ▼', ' ▶');
  } else {
    content.style.display = 'block';
    headerElement.innerHTML = headerElement.innerHTML.replace(' ▶', ' ▼');
  }
};

// 프롬프트 정보 표시
function showPromptInfo() {
  Swal.fire({
    title: '📋 사용 중인 TMSSR 프롬프트',
    html: `
      <div style="text-align: left; max-height: 500px; overflow-y: auto; padding: 15px; background: #f8fafc; border-radius: 8px; font-size: 14px; line-height: 1.6;">
        <h3 style="color: #2563eb; margin-top: 0;">🎯 Potential 판단 프롬프트</h3>
        <pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0 0 20px 0; font-family: 'Courier New', monospace; background: white; padding: 10px; border-radius: 4px; border: 1px solid #e5e7eb;">${decisionPrompt}</pre>
        
        <h3 style="color: #10b981; margin-top: 20px;">💬 피드백 프롬프트 (숨김 상태)</h3>
        <pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0; font-family: 'Courier New', monospace; background: white; padding: 10px; border-radius: 4px; border: 1px solid #e5e7eb;">${feedbackPrompt}</pre>
      </div>
    `,
    width: '800px',
    confirmButtonText: '닫기',
    confirmButtonColor: '#4f46e5',
    customClass: {
      popup: 'prompt-popup'
    }
  });
}

// 카드 삭제
function deleteSavedResult(id) {
  Swal.fire({
    title: "정말 삭제하시겠습니까?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "삭제",
    cancelButtonText: "취소"
  }).then((result) => {
    if (result.isConfirmed) {
      savedResults = savedResults.filter(r => r.id !== id);
      renderSavedResults();
      Swal.fire({
        icon: "success",
        title: "삭제 완료",
        text: "카드가 삭제되었습니다!",
        timer: 2000,
        showConfirmButton: false
      });
    }
  });
}

// CSV/TXT 파일 로드 함수
function loadCSVFile(file) {
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const csvText = e.target.result;
      const csvData = parseCSV(csvText);
      
      if (csvData.length === 0) {
        Swal.fire({
          icon: 'warning',
          title: '파일 오류',
          text: '파일이 비어있거나 형식이 올바르지 않습니다.'
        });
        return;
      }

      // 헤더 추출
      const headers = csvData[0];
      const rows = csvData.slice(1);

      console.log('CSV 헤더:', headers);
      console.log('CSV 데이터 행 수:', rows.length);

      // 1. '사용자' 열 찾기
      const userColIndex = headers.findIndex(h => 
        h.trim() === '사용자' || h.trim() === 'user' || h.trim() === 'User'
      );
      
      if (userColIndex !== -1 && rows.length > 0 && rows[0][userColIndex]) {
        const userName = rows[0][userColIndex].trim();
        document.getElementById('user-name-display').textContent = `(${userName}의 데이터)`;
        document.getElementById('user-name-display').style.display = 'inline';
      } else {
        document.getElementById('user-name-display').textContent = '';
        document.getElementById('user-name-display').style.display = 'none';
      }

      // 2. '화자' 또는 '발화자' 열 찾기
      const speakerColIndex = headers.findIndex(h => {
        const normalized = h.trim();
        return normalized === '화자' || normalized === '발화자' || 
               normalized === 'speaker' || normalized === 'Speaker';
      });

      // 3. '메시지' 또는 '대화' 열 찾기
      const messageColIndex = headers.findIndex(h => {
        const normalized = h.trim();
        return normalized === '메시지' || normalized === '대화' || 
               normalized === 'message' || normalized === 'Message' ||
               normalized === '대화 내용' || normalized === '발화';
      });

      if (speakerColIndex === -1 || messageColIndex === -1) {
        Swal.fire({
          icon: 'error',
          title: '파일 형식 오류',
          html: `파일에 필수 열이 없습니다.<br><br>
                 필요한 열:<br>
                 - <strong>화자</strong> 또는 <strong>발화자</strong><br>
                 - <strong>메시지</strong> 또는 <strong>대화</strong><br><br>
                 현재 헤더: ${headers.join(', ')}`
        });
        return;
      }

      // 4. 테이블 데이터 생성
      const tableData = [];

      // CSV 데이터 추가
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const speaker = row[speakerColIndex]?.trim() || '';
        const message = row[messageColIndex]?.trim() || '';
        
        if (speaker && message) {
          tableData.push([speaker, message, '', '']);
        }
      }

      // 최소 2행 유지
      if (tableData.length < 2) {
        tableData.push(['', '', '', '']);
      }

      // 테이블에 로드
      hot.loadData(tableData);
      hot.render();

      const fileExtension = file.name.split('.').pop().toUpperCase();
      Swal.fire({
        icon: 'success',
        title: `${fileExtension} 업로드 완료!`,
        html: `${rows.length}개의 대화가 테이블에 추가되었습니다.`,
        timer: 2000,
        showConfirmButton: false
      });

    } catch (error) {
      console.error('파일 로드 실패:', error);
      Swal.fire({
        icon: 'error',
        title: '파일 로드 실패',
        text: error.message || '파일을 읽는 중 오류가 발생했습니다.'
      });
    }
  };

  reader.onerror = function() {
    Swal.fire({
      icon: 'error',
      title: '파일 읽기 실패',
      text: '파일을 읽을 수 없습니다.'
    });
  };

  reader.readAsText(file, 'UTF-8');
}

// CSV 파싱 함수 (간단한 구현)
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  
  for (let line of lines) {
    if (line.trim() === '') continue;
    
    // 간단한 CSV 파싱 (콤마로 구분, 따옴표 처리)
    const row = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // 다음 따옴표 건너뛰기
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current); // 마지막 컬럼 추가
    
    result.push(row);
  }
  
  return result;
}

// Potential 분석 함수
async function analyzePotential() {
  // API Key 확인
  if (!apiKey || !assistantId) {
    Swal.fire({
      icon: 'error',
      title: 'API 설정 오류',
      text: '.env 파일에서 VITE_OPENAI_API_KEY와 VITE_OPENAI_ASSISTANT_ID를 설정해주세요.'
    });
    return;
  }

  // 현재 테이블 데이터 가져오기
  const currentData = hot.getData();
  const allConversation = [];
  
  for (let i = 0; i < currentData.length; i++) {
    const row = currentData[i];
    if (row[0]?.trim() && row[1]?.trim()) {
      allConversation.push({
        row: i,
        speaker: row[0].trim(),
        message: row[1].trim()
      });
    }
  }

  if (allConversation.length === 0) {
    Swal.fire({
      icon: "warning",
      title: "대화 입력 필요",
      text: "분석할 대화를 입력해 주세요."
    });
    return;
  }

  // 대화 텍스트 생성 (실제 테이블 row 번호 포함)
  const conversationText = allConversation
    .map((entry, idx) => `대화 ${idx} (테이블 행 ${entry.row}): ${entry.speaker}: ${entry.message}`)
    .join('\n');

  console.log('전송할 대화 목록:', allConversation);

  // 로딩 표시
  Swal.fire({
    title: '🔍 Potential 분석 중...',
    html: 'AI가 교사의 발화를 분석하고 있습니다.<br>잠시만 기다려주세요.',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    // Assistant API로 분석 요청
    const analysisResult = await getAssistantsAPIDecision(conversationText);
    
    console.log('분석 결과:', analysisResult);
    
    // JSON 파싱 시도
    let decisions = [];
    try {
      // JSON 코드 블록 제거 (```json ... ``` 형태)
      let jsonText = analysisResult.trim();
      if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim();
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim();
      }
      
      decisions = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('JSON 파싱 실패:', parseError);
      console.log('원본 응답:', analysisResult);
      throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
    }

    console.log('파싱된 결과:', decisions);

    // 결과를 테이블에 적용
    let updatedCount = 0;
    decisions.forEach(decision => {
      if (decision.speaker === '교사' && decision.row !== undefined) {
        // AI가 반환한 row는 allConversation의 인덱스
        const conversationIndex = decision.row;
        
        // 실제 테이블의 row 번호 가져오기
        if (conversationIndex >= 0 && conversationIndex < allConversation.length) {
          const actualTableRow = allConversation[conversationIndex].row;
          
          console.log(`대화 인덱스 ${conversationIndex} → 테이블 행 ${actualTableRow}`);
          
          if (actualTableRow >= 0 && actualTableRow < hot.countRows()) {
            // TMSSR 열(2번 인덱스)에 값 설정
            hot.setDataAtCell(actualTableRow, 2, decision.tmssr || '');
            // Potential 열(3번 인덱스)에 값 설정
            hot.setDataAtCell(actualTableRow, 3, decision.potential || '');
            updatedCount++;
          }
        }
      }
    });

    Swal.fire({
      icon: "success",
      title: "분석 완료!",
      html: `${updatedCount}개의 교사 발화가 분석되었습니다.<br><br>
             <strong>TMSSR 요소</strong>와 <strong>Potential</strong>이 테이블에 표시되었습니다.`,
      confirmButtonText: "확인"
    });

  } catch (error) {
    console.error('Potential 분석 실패:', error);
    Swal.fire({
      icon: 'error',
      title: 'Potential 분석 실패',
      text: error.message || '분석 중 오류가 발생했습니다.'
    });
  }
}

// OpenAI Assistants API 호출 (Decision 용)
async function getAssistantsAPIDecision(conversationText) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'OpenAI-Beta': 'assistants=v2'
  };

  console.log('🔵 Assistants API (Decision) 호출 시작');
  console.log('📝 ASSISTANT_ID:', assistantId);
  console.log('📦 VECTOR_STORE_ID:', vectorStoreId || '(환경 변수 없음, Assistant 기본 설정 사용)');

  // 0. Assistant 정보 확인
  try {
    const assistantInfoRes = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
      method: 'GET',
      headers
    });
    const assistantInfo = await assistantInfoRes.json();
    console.log('🤖 Assistant 정보:', {
      name: assistantInfo.name,
      model: assistantInfo.model,
      tools: assistantInfo.tools,
      tool_resources: assistantInfo.tool_resources
    });
    
    // Vector Store 확인
    const vectorStoreIds = assistantInfo.tool_resources?.file_search?.vector_store_ids;
    if (!vectorStoreIds || vectorStoreIds.length === 0) {
      console.error('❌ Vector Store가 연결되지 않았습니다!');
      throw new Error('Vector Store가 설정되지 않았습니다. Assistant에 Vector Store를 연결해주세요.');
    } else {
      console.log('✅ Vector Store ID:', vectorStoreIds[0]);
    }
  } catch (error) {
    if (error.message.includes('Vector Store')) {
      throw error;
    }
    console.warn('⚠️ Assistant 정보 조회 실패:', error);
  }

  // 1. Thread 생성 (Vector Store 포함)
  const threadBody = {};
  
  if (vectorStoreId) {
    threadBody.tool_resources = {
      file_search: {
        vector_store_ids: [vectorStoreId]
      }
    };
    console.log('📦 Thread에 Vector Store 포함:', vectorStoreId);
  }
  
  const threadRes = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers,
    body: JSON.stringify(threadBody)
  });
  
  if (!threadRes.ok) {
    const errorData = await threadRes.json();
    console.error('❌ Thread 생성 실패:', errorData);
    throw new Error('Thread 생성 실패');
  }
  
  const threadData = await threadRes.json();
  const threadId = threadData.id;
  console.log('✅ Thread 생성 완료:', threadId);

  // 2. 메시지 추가
  const messageRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      role: 'user',
      content: `${decisionPrompt}\n\n대화:\n${conversationText}`
    })
  });
  
  if (!messageRes.ok) {
    const errorData = await messageRes.json();
    console.error('❌ 메시지 추가 실패:', errorData);
    throw new Error('메시지 추가 실패');
  }
  
  console.log('✅ 메시지 추가 완료');

  // 3. Run 실행 (File Search 강제 활성화)
  const runBody = {
    assistant_id: assistantId,
    instructions: '반드시 JSON 형식으로만 응답하고, 다른 설명은 추가하지 마세요. 첨부된 파일의 TMSSR Framework 내용을 반드시 참고하여 각 교사 발화를 분석해주세요.',
    tools: [{ type: 'file_search' }],
    tool_choice: 'required'
  };
  
  if (vectorStoreId) {
    runBody.tool_resources = {
      file_search: {
        vector_store_ids: [vectorStoreId]
      }
    };
    console.log('🔥 Run에 Vector Store 명시:', vectorStoreId);
  }
  
  const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify(runBody)
  });
  
  if (!runRes.ok) {
    const errorData = await runRes.json();
    console.error('❌ Run 실행 실패:', errorData);
    throw new Error('Run 실행 실패');
  }
  
  const runData = await runRes.json();
  const runId = runData.id;
  console.log('✅ Run 시작:', runId);

  // 4. Run 완료 대기
  let status = runData.status;
  let pollCount = 0;
  while (status !== 'completed') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    pollCount++;
    
    const statusRes = await fetch(
      `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
      { headers }
    );
    const statusData = await statusRes.json();
    status = statusData.status;
    
    console.log(`⏳ Polling ${pollCount}회: ${status}`);
    
    if (status === 'failed') {
      console.error('❌ Run 실패:', statusData);
      throw new Error('GPT 실행 실패');
    }
    
    if (status === 'expired') {
      throw new Error('Run 시간 초과');
    }
    
    if (pollCount > 60) {
      throw new Error('Run 완료 대기 시간 초과 (60초)');
    }
  }
  
  console.log('✅ Run 완료');

  // 5. 메시지 가져오기
  const messagesRes = await fetch(
    `https://api.openai.com/v1/threads/${threadId}/messages`,
    { headers }
  );
  
  if (!messagesRes.ok) {
    const errorData = await messagesRes.json();
    console.error('❌ 메시지 가져오기 실패:', errorData);
    throw new Error('메시지 가져오기 실패');
  }
  
  const messagesData = await messagesRes.json();
  const assistantMessages = messagesData.data.filter(msg => msg.role === 'assistant');
  
  console.log('🤖 Assistant 메시지 개수:', assistantMessages.length);
  
  const result = assistantMessages
    .map(m => m.content[0].text.value)
    .join('\n')
    .replace(/【.*?†.*?】/g, '');
  
  console.log('✅ Assistants API (Decision) 호출 완료');
  
  return result;
}

// API 키 및 환경 변수
const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
const assistantId = import.meta.env.VITE_OPENAI_ASSISTANT_ID;
const vectorStoreId = import.meta.env.VITE_VECTOR_STORE_ID;

// 환경 변수 디버깅
console.log('OpenAI API Key:', apiKey ? '설정됨' : '설정되지 않음');
console.log('OpenAI Assistant ID:', assistantId ? '설정됨' : '설정되지 않음');
console.log('Vector Store ID:', vectorStoreId ? '설정됨' : '설정되지 않음');

// 환경 변수 검증
if (!apiKey || !assistantId) {
  console.error('OpenAI 환경 변수가 설정되지 않았습니다!');
  console.error('VITE_OPENAI_API_KEY:', apiKey);
  console.error('VITE_OPENAI_ASSISTANT_ID:', assistantId);
}

// Decision 프롬프트 (TMSSR 요소 및 Potential 판단용)
const decisionPrompt = `
다음은 교사와 학생의 대화입니다. 
첨부한 파일에 수록된 TMSSR Framework의 내용을 바탕으로, 각 교사의 발화를 분석해주세요.

**중요**: 반드시 다음 JSON 형식으로만 응답해주세요:
\`\`\`json
[
  {
    "row": 0,
    "speaker": "교사",
    "message": "원본 발화 내용",
    "tmssr": "Eliciting/Responding/Facilitating/Extending 중 하나",
    "potential": "High/Low"
  }
]
\`\`\`

**분석 기준**:
1. **TMSSR 요소 판단**: 
    - Eliciting: 학생의 생각, 이유, 아이디어를 이끌어내는 질문
    - Responding: 학생의 반응에 대한 피드백이나 명료화
    - Facilitating: 학생이 개념을 스스로 발전시키도록 돕는 설명, 힌트, 구조 제시
    - Extending: 학생의 사고를 일반화, 정당화, 반성 등으로 확장시키는 발문

2. **Potential 판단**:
    - High: 학생이 스스로 생각·정당화·일반화할 수 있도록 여지를 제공
    - Low: 교사가 답을 유도하거나 절차만 확인하는 등 사고 확장이 제한됨

**주의사항**:
- 교사의 발화만 분석해주세요 (학생 발화는 제외)
- 분석 시 직전 학생 발화의 맥락을 고려하여 교사의 의도를 추론하세요.
    - 예: 학생의 오개념을 바로잡는 경우 - Responding(High)
    - 예: 학생의 답을 평가 없이 수용 - Responding(Low)
- "row" 필드는 제시된 "대화 N" 의 N 값을 그대로 사용하세요 (0부터 시작)
- ⚠️ 반드시 JSON 배열만 출력하고, JSON 외의 어떤 설명, 문장, 해설도 포함하지 마세요.
- 첨부된 파일의 TMSSR Framework 내용을 반드시 참고하여 판단해주세요
`;

// Feedback 프롬프트
const feedbackPrompt = `
다음은 교사와 학생의 대화 또는 수업 기록입니다. 
첨부한 문서에 수록된 TMSSR Framework의 내용을 바탕으로, 사용자와 가상의 학생 사이에 이루어진 대화를 분석하여 피드백을 제공해줘.
표 형태로 정리해줘도 좋을 것 같아

피드백에는 다음이 반드시 포함되어야 해:
1. TMSSR Framework의 네 가지 요소(Eliciting, Responding, Facilitating, Extending)에 따라 교사의 발화나 상호작용을 분류하고 해석할 것
2. 교사의 발문이나 피드백 방식이 학생의 수학적 사고에 어떤 영향을 미치는지 평가할 것
3. TMSSR Framework를 바탕으로 더 효과적인 교수 전략을 구체적으로 제안할 것

중요:
- 피드백은 반드시 **마크다운 형식**으로 작성해줘
- 학생과 교사의 대화를 그대로 반복하거나 인용하지 말고, 핵심 내용을 요약하고 분석 중심으로 작성해줘
- 첨부된 문서의 내용을 참고하여 TMSSR Framework에 기반한 분석을 명확히 반영해줘
`;

async function getAssistantFeedback(userText) {
  if (!apiKey || !assistantId) {
    throw new Error('OpenAI API 키 또는 Assistant ID가 설정되지 않았습니다. .env 파일을 확인해주세요.');
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "OpenAI-Beta": "assistants=v2"
  };

  const threadRes = await fetch("https://api.openai.com/v1/threads", {
    method: "POST", headers
  });
  const threadData = await threadRes.json();
  const threadId = threadData.id;

  await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    method: "POST", headers,
    body: JSON.stringify({
      role: "user",
      content: `${feedbackPrompt}\n\n${userText}`
    })
  });

  const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: "POST", headers,
    body: JSON.stringify({
      assistant_id: assistantId,
      instructions: "출력은 반드시 한국어 마크다운 형식으로 작성해주세요."
    })
  });
  const runData = await runRes.json();
  const runId = runData.id;

  let status = runData.status;
  while (status !== "completed") {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, { headers });
    const statusData = await statusRes.json();
    status = statusData.status;
    if (status === "failed") throw new Error("GPT 실행 실패");
  }

  const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, { headers });
  const messagesData = await messagesRes.json();
  const assistantMessages = messagesData.data.filter(msg => msg.role === "assistant");
  return assistantMessages.map(m => m.content[0].text.value).join("\n").replace(/【.*?†.*?】/g, '');
}

// 이미지 다운로드
window.downloadAsImage = async function() {
  try {
    const feedbackArea = document.getElementById('result');
    
    if (feedbackArea.innerHTML.includes('placeholder') || feedbackArea.innerHTML.trim() === '') {
      Swal.fire({
        icon: 'warning',
        title: '피드백 없음',
        text: '먼저 피드백을 받아주세요.'
      });
      return;
    }

    Swal.fire({
      title: '이미지 생성 중...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const canvas = await html2canvas(feedbackArea, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true
    });

    const link = document.createElement('a');
    link.download = `피드백_${new Date().toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL();
    link.click();

    Swal.fire({
      icon: 'success',
      title: '다운로드 완료!',
      text: '피드백이 이미지로 저장되었습니다.',
      timer: 2000,
      showConfirmButton: false
    });

  } catch (error) {
    console.error('이미지 다운로드 실패:', error);
    Swal.fire({
      icon: 'error',
      title: '다운로드 실패',
      text: '이미지 생성 중 오류가 발생했습니다.'
    });
  }
};

// PDF 다운로드
window.downloadAsPdf = async function() {
  try {
    const feedbackArea = document.getElementById('result');
    
    if (feedbackArea.innerHTML.includes('placeholder') || feedbackArea.innerHTML.trim() === '') {
      Swal.fire({
        icon: 'warning',
        title: '피드백 없음',
        text: '먼저 피드백을 받아주세요.'
      });
      return;
    }

    Swal.fire({
      title: 'PDF 생성 중...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const canvas = await html2canvas(feedbackArea, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`피드백_${new Date().toISOString().split('T')[0]}.pdf`);

    Swal.fire({
      icon: 'success',
      title: '다운로드 완료!',
      text: '피드백이 PDF로 저장되었습니다.',
      timer: 2000,
      showConfirmButton: false
    });

  } catch (error) {
    console.error('PDF 다운로드 실패:', error);
    Swal.fire({
      icon: 'error',
      title: '다운로드 실패',
      text: 'PDF 생성 중 오류가 발생했습니다.'
    });
  }
};

// 피드백 이미지 다운로드
window.downloadFeedbackAsImage = async function(button) {
  try {
    const feedbackCard = button.closest('.saved-result');
    const feedbackArea = feedbackCard.querySelector('.feedback-area');
    
    if (!feedbackArea) {
      Swal.fire({
        icon: 'warning',
        title: '피드백 없음',
        text: '다운로드할 피드백이 없습니다.'
      });
      return;
    }

    Swal.fire({
      title: '이미지 생성 중...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const tempContainer = document.createElement('div');
    tempContainer.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      width: 1200px;
      background: white;
      padding: 40px;
      font-family: 'Noto Sans KR', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
      box-sizing: border-box;
    `;
    
    tempContainer.innerHTML = `
      <div style="
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 40px;
        width: 100%;
      ">
        <div style="
          background: #f8fafc;
          padding: 20px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        ">
          <h3 style="margin: 0 0 15px 0; color: #2563eb; font-size: 18px;">💬 대화문</h3>
          ${feedbackCard.querySelector('.conversation-table').outerHTML}
        </div>
        <div style="
          background: #f0f9ff;
          padding: 20px;
          border-radius: 8px;
          border: 1px solid #3b82f6;
        ">
          <h3 style="margin: 0 0 15px 0; color: #1e40af; font-size: 18px;">📝 AI 피드백</h3>
          ${feedbackArea.innerHTML}
        </div>
      </div>
    `;
    
    document.body.appendChild(tempContainer);
    
    const canvas = await html2canvas(tempContainer, {
      backgroundColor: '#ffffff',
      scale: 2,
      width: 1200,
      height: tempContainer.scrollHeight,
      useCORS: true,
      allowTaint: true
    });
    
    document.body.removeChild(tempContainer);

    const link = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    link.download = `피드백_${timestamp}.png`;
    link.href = canvas.toDataURL();
    link.click();

    Swal.fire({
      icon: 'success',
      title: '다운로드 완료!',
      text: '피드백이 이미지로 저장되었습니다.',
      timer: 2000,
      showConfirmButton: false
    });

  } catch (error) {
    console.error('이미지 다운로드 실패:', error);
    Swal.fire({
      icon: 'error',
      title: '다운로드 실패',
      text: '이미지 생성 중 오류가 발생했습니다.'
    });
  }
};

// 피드백 PDF 다운로드
window.downloadFeedbackAsPdf = async function(button) {
  try {
    const feedbackCard = button.closest('.saved-result');
    const feedbackArea = feedbackCard.querySelector('.feedback-area');
    
    if (!feedbackArea) {
      Swal.fire({
        icon: 'warning',
        title: '피드백 없음',
        text: '다운로드할 피드백이 없습니다.'
      });
      return;
    }

    Swal.fire({
      title: 'PDF 생성 중...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const tempContainer = document.createElement('div');
    tempContainer.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      width: 1200px;
      background: white;
      padding: 40px;
      font-family: 'Noto Sans KR', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
      box-sizing: border-box;
    `;
    
    tempContainer.innerHTML = `
      <div style="
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 40px;
        width: 100%;
      ">
        <div style="
          background: #f8fafc;
          padding: 20px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        ">
          <h3 style="margin: 0 0 15px 0; color: #2563eb; font-size: 18px;">💬 대화문</h3>
          ${feedbackCard.querySelector('.conversation-table').outerHTML}
        </div>
        <div style="
          background: #f0f9ff;
          padding: 20px;
          border-radius: 8px;
          border: 1px solid #3b82f6;
        ">
          <h3 style="margin: 0 0 15px 0; color: #1e40af; font-size: 18px;">📝 AI 피드백</h3>
          ${feedbackArea.innerHTML}
        </div>
      </div>
    `;
    
    document.body.appendChild(tempContainer);
    
    const canvas = await html2canvas(tempContainer, {
      backgroundColor: '#ffffff',
      scale: 2,
      width: 1200,
      height: tempContainer.scrollHeight,
      useCORS: true,
      allowTaint: true
    });
    
    document.body.removeChild(tempContainer);

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    const timestamp = new Date().toISOString().split('T')[0];
    pdf.save(`피드백_${timestamp}.pdf`);

    Swal.fire({
      icon: 'success',
      title: '다운로드 완료!',
      text: '피드백이 PDF로 저장되었습니다.',
      timer: 2000,
      showConfirmButton: false
    });

  } catch (error) {
    console.error('PDF 다운로드 실패:', error);
    Swal.fire({
      icon: 'error',
      title: '다운로드 실패',
      text: 'PDF 생성 중 오류가 발생했습니다.'
    });
  }
};