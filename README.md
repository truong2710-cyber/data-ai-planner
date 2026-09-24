# Data AI Planner — triển khai và cập nhật mỗi ngày

Bản dữ liệu kèm theo: 24/09/2026, 58 môn, 411 buổi học, năm học 2026–2027.
Giao diện và chức năng planner được giữ nguyên. Liên kết Program được đổi sang trang cùng website để dùng trên GitHub Pages.

## Thiết lập một lần bằng trình duyệt

1. Giải nén ZIP. Mở https://github.com/truong2710-cyber/data-ai-planner, chọn **Add file → Upload files**. Kéo các file và thư mục bên trong ZIP lên, không tải nguyên file ZIP và không thêm một thư mục bao ngoài. File `index.html` phải ở ngay gốc repository. Chọn **Commit changes** vào nhánh `main`.
2. Kiểm tra repository có `.github/workflows/deploy.yml`. Thư mục `.github` bị ẩn trên một số máy (Mac: Cmd+Shift+.). Nếu chưa tải được thư mục này: chọn **Add file → Create new file**, nhập tên `.github/workflows/deploy.yml`, mở `WORKFLOW_TO_COPY.yml` trong bản giải nén, sao chép toàn bộ nội dung vào file mới rồi **Commit changes**. Chỉ tạo một workflow này, không tạo thêm workflow từ mẫu GitHub.
3. Mở **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions**.
4. Mở **Actions → Update and deploy planner → Run workflow**, chọn nhánh `main`, rồi **Run workflow**. Lần này vừa thử lấy dữ liệu trực tiếp vừa xuất bản. Chờ tất cả bước có dấu xanh.
5. Website dự kiến: https://truong2710-cyber.github.io/data-ai-planner/ . URL chính xác cũng hiện trong kết quả bước **Publish**.

Nếu lượt chạy đầu do upload xảy ra trước khi bật Pages và thất bại, làm bước 4 để chạy lại.
Nếu GitHub yêu cầu cho phép Actions chạy trong repository, bật ở tab Actions. Không cần thêm API key, token cá nhân hoặc plugin ChatGPT.

## Cập nhật tự động

- Hằng ngày lúc **04:17 UTC**: tương đương 06:17 giờ Paris mùa hè, 05:17 mùa đông, hoặc 11:17 giờ Việt Nam. GitHub có thể chạy trễ khi hàng đợi đông.
- Tải lại https://dataai.telecom-paris.fr/courses và từng lịch được liên kết tại đó; không dựa vào bản HTML lưu trong ZIP.
- Cập nhật tên môn, giảng viên, ECTS, nhóm môn, điều kiện tiên quyết, đường dẫn lịch, các buổi học và phòng. Môn mới trong danh mục được thêm vào. Mô tả tóm tắt và quy tắc xét tín chỉ hiện có được giữ nguyên; thay đổi quy chế cần kiểm tra riêng.
- Chỉ nhận buổi học khớp mã môn và năm học 2026–2027. Có ánh xạ rõ ràng cho các mã môn khác nhau đã được đối chiếu.
- Kiểm tra dữ liệu, lưu bằng commit của github-actions[bot], rồi triển khai ngay trong cùng workflow. Thời điểm `generated` ghi nhận lần lấy dữ liệu thành công.
- Khi tải lỗi, định dạng thay đổi, môn biến mất/đổi mã hoặc lịch từng có dữ liệu bỗng rỗng: workflow báo lỗi và không triển khai. Website đang xuất bản vẫn giữ bản trước. Xem lỗi ở Actions; không có cơ chế tự đoán lịch thay thế.
- Lịch có quy tắc lặp mới cần được kiểm tra, không tự chuyển thành các ngày đoán trước.
- Upload/push thông thường triển khai bản dữ liệu đã có. Chạy thủ công hoặc lịch hằng ngày mới lấy dữ liệu từ trường.
- Từ 01/09/2027, bộ cập nhật dừng để yêu cầu kiểm tra năm học mới. Chỉnh START/END chỉ sau khi đối chiếu danh mục và quy chế mới.

## Nếu gặp lỗi

- **403/timeout ở Refresh official course data:** website trường không cho tải hoặc tạm thời lỗi. Website hiện tại vẫn hoạt động; chạy lại sau. Không coi lượt chạy đỏ là dữ liệu đã được cập nhật.
- **git push bị từ chối:** kiểm tra Settings → Actions → General → Workflow permissions và quy tắc bảo vệ nhánh main. Workflow cần quyền contents: write. Nếu quản trị viên chặn, cần người có quyền thay đổi; gói này không vượt qua hạn chế đó.
- **Pages thất bại:** kiểm tra Source đã chọn GitHub Actions và repository cho phép GitHub Pages.
- **Lịch tự động dừng:** kiểm tra tab Actions. GitHub có thể tắt lịch của repository công khai sau 60 ngày không hoạt động. Mỗi lần cập nhật thành công ở đây có commit; nếu không chạy lâu, kiểm tra và bật lại workflow.

## Mức độ kiểm tra

Đã kiểm tra cấu trúc snapshot 58 môn / 411 buổi; chạy 6 bài kiểm tra bộ cập nhật (múi giờ, dòng ICS gấp, sai mã môn, lịch thiếu/lặp, HTML, lỗi tải không làm đổi snapshot). Bộ đọc ICS cũng đã đọc lại các lịch chính thức lưu ngày 24/09 và cho đúng 411 buổi.

Chưa triển khai lên tài khoản GitHub của bạn. Kết nối ghi GitHub hiện không có quyền phù hợp. Việc lấy nguồn trực tiếp từ máy GitHub Actions cần được xác nhận bằng lượt chạy ở bước 4; kiểm tra trong môi trường này sử dụng bản nguồn đã lưu và HTML mẫu.

Chạy cục bộ bằng Python 3.11+ và Node.js:

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/update_data.py
node scripts/validate-data.cjs
```

Tài liệu GitHub:
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
