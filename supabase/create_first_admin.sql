-- =====================================================================
-- إنشاء أول مسؤول (نفّذه مرة واحدة فقط، بعد إنشاء المستخدم من Authentication → Users)
-- 1) Authentication → Users → Add user → ضع بريدك وكلمة مرور قوية (فعّل Auto Confirm).
--    كلمة المرور تكتبها أنت في لوحة Supabase فقط — لا ترسلها لأي أحد.
-- 2) غيّر البريد أدناه إلى بريدك ثم شغّل الاستعلام.
-- =====================================================================
insert into public.admin_users (user_id)
select id from auth.users where email = 'PUT-YOUR-ADMIN-EMAIL-HERE@example.com'
on conflict (user_id) do nothing;

-- تحقّق: يجب أن يظهر صف واحد
select u.email, a.role from public.admin_users a join auth.users u on u.id = a.user_id;
