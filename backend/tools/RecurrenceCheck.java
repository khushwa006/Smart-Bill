import com.smartbill.common.*; import com.smartbill.common.Enums.*; import java.time.LocalDate; import java.util.*;
public class RecurrenceCheck {
  static int fail=0;
  static void eq(String n,Object a,Object b){ boolean ok=a.equals(b); if(!ok)fail++; System.out.println((ok?"PASS ":"FAIL ")+n+(ok?"":" got "+a+" expected "+b)); }
  static void bad(String n,Runnable r){ try{r.run(); fail++; System.out.println("FAIL "+n);}catch(IllegalArgumentException e){System.out.println("PASS "+n);} }
  public static void main(String[] a){
    var m31=new RecurrenceCalculator.Rule(Frequency.MONTHLY,null,null,LocalDate.of(2026,1,31),false);
    eq("monthly 31st: Feb (non-leap)",RecurrenceCalculator.occurrence(m31,1),LocalDate.of(2026,2,28));
    eq("monthly 31st: Mar returns to 31",RecurrenceCalculator.occurrence(m31,2),LocalDate.of(2026,3,31));
    eq("monthly 31st: Apr = 30",RecurrenceCalculator.occurrence(m31,3),LocalDate.of(2026,4,30));
    eq("monthly 31st: Feb 2028 leap = 29",RecurrenceCalculator.occurrence(m31,25),LocalDate.of(2028,2,29));
    var me=new RecurrenceCalculator.Rule(Frequency.MONTHLY,null,null,LocalDate.of(2026,1,30),true);
    eq("month-end anchored from 30th: Jan->Feb 28",RecurrenceCalculator.occurrence(me,1),LocalDate.of(2026,2,28));
    eq("month-end anchored: Mar 31",RecurrenceCalculator.occurrence(me,2),LocalDate.of(2026,3,31));
    var leap=new RecurrenceCalculator.Rule(Frequency.YEARLY,null,null,LocalDate.of(2024,2,29),false);
    eq("yearly Feb 29 -> 2025 Feb 28",RecurrenceCalculator.occurrence(leap,1),LocalDate.of(2025,2,28));
    eq("yearly Feb 29 -> 2028 Feb 29",RecurrenceCalculator.occurrence(leap,4),LocalDate.of(2028,2,29));
    var wk=new RecurrenceCalculator.Rule(Frequency.WEEKLY,null,null,LocalDate.of(2026,10,16),false);
    eq("weekly +3",RecurrenceCalculator.occurrence(wk,3),LocalDate.of(2026,11,6));
    var q=new RecurrenceCalculator.Rule(Frequency.QUARTERLY,null,null,LocalDate.of(2026,11,30),false);
    eq("quarterly Nov30 -> Feb 28",RecurrenceCalculator.occurrence(q,1),LocalDate.of(2027,2,28));
    var h=new RecurrenceCalculator.Rule(Frequency.HALF_YEARLY,null,null,LocalDate.of(2026,8,31),false);
    eq("half-yearly Aug31 -> Feb 28",RecurrenceCalculator.occurrence(h,1),LocalDate.of(2027,2,28));
    var c=new RecurrenceCalculator.Rule(Frequency.CUSTOM,45,CustomUnit.DAYS,LocalDate.of(2026,1,1),false);
    eq("custom 45 days x2",RecurrenceCalculator.occurrence(c,2),LocalDate.of(2026,4,1));
    var cm=new RecurrenceCalculator.Rule(Frequency.CUSTOM,2,CustomUnit.MONTHS,LocalDate.of(2026,12,31),false);
    eq("custom 2 months from Dec31 -> Feb 28",RecurrenceCalculator.occurrence(cm,1),LocalDate.of(2027,2,28));
    eq("between() monthly Oct18..Jan18 count",RecurrenceCalculator.between(new RecurrenceCalculator.Rule(Frequency.MONTHLY,null,null,LocalDate.of(2026,10,18),false),LocalDate.of(2026,10,18),LocalDate.of(2027,1,18),50).size(),4);
    eq("firstOnOrAfter",RecurrenceCalculator.firstOnOrAfter(m31,LocalDate.of(2026,2,1)),LocalDate.of(2026,2,28));
    bad("CUSTOM without interval",()->RecurrenceCalculator.validate(new RecurrenceCalculator.Rule(Frequency.CUSTOM,null,null,LocalDate.of(2026,1,1),false)));
    bad("zero interval",()->RecurrenceCalculator.validate(new RecurrenceCalculator.Rule(Frequency.CUSTOM,0,CustomUnit.DAYS,LocalDate.of(2026,1,1),false)));
    bad("interval on non-custom",()->RecurrenceCalculator.validate(new RecurrenceCalculator.Rule(Frequency.MONTHLY,1,CustomUnit.DAYS,LocalDate.of(2026,1,1),false)));
    bad("month-end on weekly",()->RecurrenceCalculator.validate(new RecurrenceCalculator.Rule(Frequency.WEEKLY,null,null,LocalDate.of(2026,1,1),true)));
    bad("null anchor",()->RecurrenceCalculator.validate(new RecurrenceCalculator.Rule(Frequency.MONTHLY,null,null,null,false)));
    System.out.println(fail==0?"ALL PASSED":("FAILURES: "+fail)); System.exit(fail==0?0:1);
  }
}
