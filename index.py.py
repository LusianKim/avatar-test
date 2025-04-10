with open('index.html', 'w') as f:
    f.write('''
<!DOCTYPE html>
<html>
<head>
    <title>MSLearn AI 질문 시스템</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .container {
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .response {
            background-color: #f9f9f9;
            padding: 15px;
            border-radius: 5px;
            margin-top: 10px;
        }
        .talk-section {
            display: none;
            margin-top: 20px;
        }
        button {
            padding: 8px 15px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover {
            background-color: #45a049;
        }
        input[type="text"] {
            width: 100%;
            padding: 10px;
            margin: 10px 0;
            box-sizing: border-box;
        }
        .loader {
            border: 5px solid #f3f3f3;
            border-radius: 50%;
            border-top: 5px solid #3498db;
            width: 30px;
            height: 30px;
            animation: spin 2s linear infinite;
            display: none;
            margin: 10px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .log-section {
            margin-top: 20px;
            display: none;
        }
        .log-toggle {
            color: blue;
            text-decoration: underline;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <h1>MSLearn AI 질문 시스템</h1>
    
    <div class="container">
        <h2>질문하기</h2>
        <input type="text" id="query" placeholder="MSLearn에 궁금한 사항을 물어보세요!">
        <button id="submit-btn">질문하기</button>
        <div class="loader" id="loader"></div>
        
        <div id="text-response" class="response" style="display:none;"></div>
        
        <div class="log-section">
            <p class="log-toggle" onclick="toggleLogs()">처리 로그 보기</p>
            <div id="logs" style="display:none;"></div>
        </div>
    </div>
    
    <div class="container talk-section" id="talk-section">
        <h2>대화형 응답</h2>
        <div id="talk-response" class="response"></div>
        <button id="next-btn">다음</button>
    </div>
    
    <script>
        let talkData = null;
        let partNumber = 2;
        
        document.getElementById('submit-btn').addEventListener('click', async () => {
            const query = document.getElementById('query').value.trim();
            if (!query) {
                alert('질문을 입력해주세요.');
                return;
            }
            
            // UI 초기화
            document.getElementById('text-response').style.display = 'none';
            document.getElementById('talk-section').style.display = 'none';
            document.getElementById('loader').style.display = 'block';
            document.getElementById('submit-btn').disabled = true;
            
            try {
                const response = await fetch('/api/query', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ query })
                });
                
                const data = await response.json();
                
                // 로그 표시
                document.querySelector('.log-section').style.display = 'block';
                const logsContainer = document.getElementById('logs');
                logsContainer.innerHTML = '';
                
                if (data.verification_logs) {
                    data.verification_logs.forEach(log => {
                        const logItem = document.createElement('div');
                        logItem.innerHTML = `<h3>${log.agent}</h3><p>${log.response}</p>`;
                        logsContainer.appendChild(logItem);
                    });
                }
                
                if (data.status === 'success') {
                    // 텍스트 응답 표시
                    const textResponse = document.getElementById('text-response');
                    textResponse.innerHTML = data.text_response;
                    textResponse.style.display = 'block';
                    
                    // 대화형 응답 초기화
                    if (data.talk_initial) {
                        talkData = data.talk_initial;
                        document.getElementById('talk-response').innerHTML = talkData.initial_response;
                        document.getElementById('talk-section').style.display = 'block';
                        
                        if (talkData.completed) {
                            document.getElementById('next-btn').disabled = true;
                        } else {
                            document.getElementById('next-btn').disabled = false;
                        }
                    }
                } else {
                    alert(data.message || '처리 중 오류가 발생했습니다.');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('서버 요청 중 오류가 발생했습니다.');
            } finally {
                document.getElementById('loader').style.display = 'none';
                document.getElementById('submit-btn').disabled = false;
            }
        });
        
        document.getElementById('next-btn').addEventListener('click', async () => {
            if (!talkData || talkData.completed) return;
            
            document.getElementById('next-btn').disabled = true;
            document.getElementById('loader').style.display = 'block';
            
            try {
                const response = await fetch('/api/continue_talk', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        thread_id: talkData.thread_id,
                        agent_id: talkData.agent_id,
                        part_number: partNumber
                    })
                });
                
                const data = await response.json();
                
                if (data.status === 'success') {
                    const talkResponse = document.getElementById('talk-response');
                    talkResponse.innerHTML = data.response.response;
                    
                    if (data.response.completed) {
                        document.getElementById('next-btn').disabled = true;
                    } else {
                        document.getElementById('next-btn').disabled = false;
                        partNumber++;
                    }
                } else {
                    alert(data.message || '처리 중 오류가 발생했습니다.');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('서버 요청 중 오류가 발생했습니다.');
            } finally {
                document.getElementById('loader').style.display = 'none';
            }
        });
        
        function toggleLogs() {
            const logs = document.getElementById('logs');
            logs.style.display = logs.style.display === 'none' ? 'block' : 'none';
        }
    </script>
</body>
</html>
''')
    

# --------------------------------------------------------------------------------------------------------------------#

