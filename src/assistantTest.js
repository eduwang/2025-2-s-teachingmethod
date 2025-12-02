// 🔗 OpenAI Assistants API를 사용한 챗봇
const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
const assistantId = import.meta.env.VITE_OPENAI_ASSISTANT_ID;
const vectorStoreId = import.meta.env.VITE_VECTOR_STORE_ID;

// 환경 변수 검증
if (!apiKey || !assistantId) {
  console.error('OpenAI 환경 변수가 설정되지 않았습니다!');
  alert('OpenAI API 키 또는 Assistant ID가 설정되지 않았습니다.');
}

// DOM 요소
const chatContainer = document.getElementById('chatContainer');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const apiStatus = document.getElementById('apiStatus');
const assistantStatus = document.getElementById('assistantStatus');
const vectorStoreStatus = document.getElementById('vectorStoreStatus');

// Thread ID 저장 (대화 유지)
let currentThreadId = null;

// 시스템 프롬프트 (첨부된 문서만 기준으로 답변)
const systemInstructions = `당신은 첨부된 문서의 내용만을 기준으로 답변하는 어시스턴트입니다.

**중요 지시사항:**
- 반드시 첨부된 문서(Vector Store에 저장된 문서)의 내용만을 기준으로 답변하세요.
- 문서에 없는 정보나 문서와 관련 없는 질문에 대해서는 "첨부된 문서에는 해당 정보가 없습니다"라고 답변하세요.
- 문서의 내용을 정확히 인용하고, 문서의 맥락을 존중하여 답변하세요.
- 문서의 내용을 바탕으로 한 추론이나 해석은 가능하지만, 문서에 없는 새로운 정보를 추가하지 마세요.
- 한국어로 친절하고 명확하게 답변하세요.`;

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
  // 상태 확인
  await checkSystemStatus();

  // Enter 키로 전송 (Shift+Enter는 줄바꿈)
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 전송 버튼 클릭
  sendButton.addEventListener('click', sendMessage);

  // 텍스트 영역 자동 높이 조절
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
  });
});

// 시스템 상태 확인
async function checkSystemStatus() {
  // 1. API 키 확인
  updateStatus(apiStatus, apiKey ? 'active' : 'inactive', apiKey ? 'GPT API 정상' : 'GPT API 미설정');

  // 2. Assistant 확인
  if (apiKey && assistantId) {
    updateStatus(assistantStatus, 'checking', 'Assistant 확인 중...');
    try {
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      };
      
      const response = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
        method: 'GET',
        headers
      });

      if (response.ok) {
        const assistantInfo = await response.json();
        updateStatus(assistantStatus, 'active', `Assistant 정상 (${assistantInfo.name || assistantId})`);
        
        // 3. Vector Store 확인
        const vectorStoreIds = assistantInfo.tool_resources?.file_search?.vector_store_ids;
        if (vectorStoreIds && vectorStoreIds.length > 0) {
          updateStatus(vectorStoreStatus, 'active', `Vector Store 정상 (${vectorStoreIds.length}개)`);
        } else if (vectorStoreId) {
          updateStatus(vectorStoreStatus, 'inactive', 'Vector Store 미연결');
        } else {
          updateStatus(vectorStoreStatus, 'inactive', 'Vector Store 미설정');
        }
      } else {
        const errorData = await response.json();
        updateStatus(assistantStatus, 'inactive', `Assistant 오류: ${errorData.error?.message || '알 수 없는 오류'}`);
        updateStatus(vectorStoreStatus, 'inactive', 'Vector Store 확인 불가');
      }
    } catch (error) {
      updateStatus(assistantStatus, 'inactive', `Assistant 확인 실패: ${error.message}`);
      updateStatus(vectorStoreStatus, 'inactive', 'Vector Store 확인 불가');
    }
  } else {
    updateStatus(assistantStatus, 'inactive', 'Assistant 확인 불가 (API 키 필요)');
    updateStatus(vectorStoreStatus, 'inactive', 'Vector Store 확인 불가');
  }
}

// 상태 업데이트
function updateStatus(element, status, text) {
  const dot = element.querySelector('.status-dot');
  const textElement = element.querySelector('.status-text');
  
  // 기존 클래스 제거
  dot.classList.remove('active', 'inactive', 'checking');
  
  // 새 상태 클래스 추가
  if (status === 'active' || status === 'inactive' || status === 'checking') {
    dot.classList.add(status);
  }
  
  // 텍스트 업데이트
  textElement.textContent = text;
}

// 메시지 전송
async function sendMessage() {
  const message = userInput.value.trim();
  
  if (!message) {
    return;
  }

  // 사용자 메시지 표시
  addMessage('user', message);
  userInput.value = '';
  userInput.style.height = 'auto';
  
  // 전송 버튼 비활성화
  sendButton.disabled = true;
  userInput.disabled = true;

  // 로딩 표시
  const loadingId = showLoading();

  try {
    // Thread가 없으면 생성
    if (!currentThreadId) {
      currentThreadId = await createThread();
    }

    // 메시지 추가
    await addMessageToThread(message);

    // Assistant 응답 받기
    const response = await getAssistantResponse();

    // 로딩 제거
    removeLoading(loadingId);

    // Assistant 메시지 표시
    addMessage('assistant', response);

  } catch (error) {
    console.error('에러 발생:', error);
    removeLoading(loadingId);
    addMessage('assistant', `❌ 오류가 발생했습니다: ${error.message}`, true);
  } finally {
    // 전송 버튼 활성화
    sendButton.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }
}

// Thread 생성
async function createThread() {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'OpenAI-Beta': 'assistants=v2'
  };

  const threadBody = {};
  
  // Vector Store 포함
  if (vectorStoreId) {
    threadBody.tool_resources = {
      file_search: {
        vector_store_ids: [vectorStoreId]
      }
    };
    console.log('📦 Thread에 Vector Store 포함:', vectorStoreId);
  }

  const response = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers,
    body: JSON.stringify(threadBody)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Thread 생성 실패: ${errorData.error?.message || '알 수 없는 오류'}`);
  }

  const data = await response.json();
  console.log('✅ Thread 생성 완료:', data.id);
  return data.id;
}

// Thread에 메시지 추가
async function addMessageToThread(message) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'OpenAI-Beta': 'assistants=v2'
  };

  const response = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      role: 'user',
      content: message
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`메시지 추가 실패: ${errorData.error?.message || '알 수 없는 오류'}`);
  }

  console.log('✅ 메시지 추가 완료');
}

// Assistant 응답 받기
async function getAssistantResponse() {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'OpenAI-Beta': 'assistants=v2'
  };

  // Run 실행
  const runBody = {
    assistant_id: assistantId,
    instructions: systemInstructions
  };

  // Vector Store 및 File Search tool 설정
  if (vectorStoreId) {
    runBody.tools = [{ type: 'file_search' }];
    runBody.tool_resources = {
      file_search: {
        vector_store_ids: [vectorStoreId]
      }
    };
    // tool_choice를 'required'로 설정하여 file_search가 반드시 실행되도록
    runBody.tool_choice = 'required';
    console.log('🔥 Run에 Vector Store 및 File Search tool 명시:', vectorStoreId);
  }

  const runResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify(runBody)
  });

  if (!runResponse.ok) {
    const errorData = await runResponse.json();
    throw new Error(`Run 실행 실패: ${errorData.error?.message || '알 수 없는 오류'}`);
  }

  const runData = await runResponse.json();
  const runId = runData.id;
  console.log('✅ Run 시작:', runId);
  console.log('📊 Run 상세 정보:', JSON.stringify(runData, null, 2));

  // Run 완료 대기
  let status = runData.status;
  let pollCount = 0;
  const maxPolls = 120; // Vector Store 검색은 시간이 걸릴 수 있으므로 120초로 증가

  while (status !== 'completed') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    pollCount++;

    const statusResponse = await fetch(
      `https://api.openai.com/v1/threads/${currentThreadId}/runs/${runId}`,
      { headers }
    );

    if (!statusResponse.ok) {
      throw new Error('Run 상태 확인 실패');
    }

    const statusData = await statusResponse.json();
    status = statusData.status;

    console.log(`⏳ Polling ${pollCount}회: ${status}`);
    
    // requires_action 상태 처리 (file_search 실행 중일 수 있음)
    if (status === 'requires_action') {
      console.log('📋 Tool 실행 필요:', statusData.required_action);
      // file_search는 자동으로 실행되므로 계속 대기
      continue;
    }

    if (status === 'failed') {
      console.error('❌ Run 실패:', statusData);
      console.error('❌ 오류 상세:', statusData.last_error);
      throw new Error(`GPT 실행 실패: ${statusData.last_error?.message || '알 수 없는 오류'}`);
    }

    if (status === 'expired') {
      throw new Error('Run 시간 초과');
    }

    if (pollCount > maxPolls) {
      throw new Error('Run 완료 대기 시간 초과');
    }
  }

  console.log('✅ Run 완료');

  // Run 완료 후 tool_calls 확인 (디버깅용)
  const finalRunResponse = await fetch(
    `https://api.openai.com/v1/threads/${currentThreadId}/runs/${runId}`,
    { headers }
  );
  const finalRunData = await finalRunResponse.json();
  
  if (finalRunData.steps && finalRunData.steps.length > 0) {
    console.log('📋 Run 단계:', finalRunData.steps.length, '개');
    finalRunData.steps.forEach((step, index) => {
      if (step.step_details?.tool_calls) {
        console.log(`🔧 Step ${index + 1} - Tool calls:`, step.step_details.tool_calls.length, '개');
        step.step_details.tool_calls.forEach((call, callIndex) => {
          console.log(`  Tool ${callIndex + 1}:`, call.type, call.id);
        });
      }
    });
  }

  // 메시지 가져오기 (order=asc로 최신 메시지가 마지막에 오도록)
  const messagesResponse = await fetch(
    `https://api.openai.com/v1/threads/${currentThreadId}/messages?order=asc`,
    { headers }
  );

  if (!messagesResponse.ok) {
    const errorData = await messagesResponse.json();
    throw new Error(`메시지 가져오기 실패: ${errorData.error?.message || '알 수 없는 오류'}`);
  }

  const messagesData = await messagesResponse.json();
  const assistantMessages = messagesData.data.filter(msg => msg.role === 'assistant');

  if (assistantMessages.length === 0) {
    throw new Error('Assistant 응답을 받을 수 없습니다');
  }

  // 가장 최근 메시지의 텍스트 내용 추출 (order=asc이므로 마지막 요소)
  const latestMessage = assistantMessages[assistantMessages.length - 1];
  console.log('📨 최신 메시지 ID:', latestMessage.id);
  
  const textContent = latestMessage.content
    .filter(item => item.type === 'text')
    .map(item => item.text.value)
    .join('\n')
    .replace(/【.*?†.*?】/g, ''); // 참조 제거

  console.log('✅ Assistant 응답 받기 완료');
  return textContent;
}

// 채팅 메시지 추가
function addMessage(role, content, isError = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}${isError ? ' error' : ''}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  if (isError) {
    contentDiv.textContent = content;
  } else {
    // 마크다운 형식 지원 (간단한 변환)
    contentDiv.innerHTML = formatMessage(content);
  }

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);

  // 스크롤을 맨 아래로
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 메시지 포맷팅 (마크다운 간단 변환)
function formatMessage(text) {
  // 코드 블록 처리
  text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // 인라인 코드 처리
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // 굵은 글씨 처리
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // 기울임 처리
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // 줄바꿈 처리
  text = text.replace(/\n/g, '<br>');
  
  return text;
}

// 로딩 표시
function showLoading() {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'message assistant';
  loadingDiv.id = 'loading-message';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '🤖';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = `
    <div class="loading">
      <span>답변 생성 중</span>
      <div class="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;

  loadingDiv.appendChild(avatar);
  loadingDiv.appendChild(contentDiv);
  chatContainer.appendChild(loadingDiv);

  // 스크롤을 맨 아래로
  chatContainer.scrollTop = chatContainer.scrollHeight;

  return 'loading-message';
}

// 로딩 제거
function removeLoading(loadingId) {
  const loadingElement = document.getElementById(loadingId);
  if (loadingElement) {
    loadingElement.remove();
  }
}

